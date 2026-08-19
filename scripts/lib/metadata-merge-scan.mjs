// Pure Scan-/Diff-Logik fuer die Metadata-Merge-Drift-Bremse.
// Keine I/O, kein git -> unit-testbar. CLI-Wrapper: ../check-metadata-merge.mjs
//
// Next.js merged `metadata` aus Layout und Page nur FLACH (Doku "Merging":
// "Metadata objects exported from multiple segments … are shallowly merged …
// nested fields … are overwritten by the last segment to define them").
// Eine Seite mit eigenem `openGraph`/`twitter`-Block ERSETZT damit den des
// Layouts komplett — inklusive `images`. Jedes Layout-Default in einem
// verschachtelten Feld wirkt also nur fuer Seiten, die das Feld gar nicht
// anfassen.
//
// Die Klasse ist im SEO-Audit 18.08.2026 FUENFMAL aufgetreten, ueber zwei
// Properties, und wurde von Build, tsc und keinem der bestehenden Ratchets
// gefangen:
//   alternates.canonical  -> 4 Rechtsseiten canonicalisierten auf die Startseite (#5352)
//   alternates.types      -> Feeds nur auf 10 von 343 Seiten (#5357)
//   openGraph.images      -> 167 Seiten ohne Vorschaubild (#5369)
//   twitter.images        -> 3 Seiten, /werkstatt-finden verlor beides (#5369)
//   dieselbe auf autounfall.io -> ~200 von 254 Seiten (#5384)
//
// ⭐ Der Scanner faengt bewusst AUCH den Fall, den ein "enthaelt images"-Grep
// verfehlt: `...(cond ? { images } : {})`. Genau daran hingen die letzten 31
// Seiten auf autounfall.io — der Grep sagte "hat images", die Messung 223/254.

/** Kommentare + String-/Template-Literale neutralisieren. */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
}

/**
 * Extrahiert den Inhalt eines `<key>: {` … `}`-Blocks per Brace-Depth-Tracking.
 * Einrueckungs-Heuristiken sind hier unbrauchbar (die Bloecke sind beliebig
 * verschachtelt), Depth-Tracking ist exakt.
 *
 * @returns {{ body: string, index: number }[]} alle Vorkommen des Keys
 */
export function extractBlocks(code, key) {
  const out = []
  const re = new RegExp(`\\b${key}\\s*:\\s*\\{`, 'g')
  let m
  while ((m = re.exec(code)) !== null) {
    const start = m.index + m[0].length // hinter der oeffnenden Klammer
    let depth = 1
    let i = start
    while (i < code.length && depth > 0) {
      const c = code[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    if (depth === 0) out.push({ body: code.slice(start, i - 1), index: m.index })
  }
  return out
}

/**
 * Entfernt Spread-Conditionals `...( … )` aus einem Block.
 * Was darin steht, ist NICHT garantiert vorhanden — genau der Fall, der auf
 * autounfall.io 31 Artikel ohne Vorschaubild liess.
 */
export function stripSpreadConditionals(blockBody) {
  let out = ''
  let i = 0
  while (i < blockBody.length) {
    if (blockBody.startsWith('...(', i)) {
      let depth = 1
      let j = i + 4
      while (j < blockBody.length && depth > 0) {
        if (blockBody[j] === '(') depth++
        else if (blockBody[j] === ')') depth--
        j++
      }
      i = j // Spread komplett verwerfen
      continue
    }
    out += blockBody[i]
    i++
  }
  return out
}

/** Zeilennummer eines Zeichen-Offsets (1-basiert). */
function lineOf(code, index) {
  return code.slice(0, index).split('\n').length
}

/**
 * @param {string} src Datei-Inhalt
 * @param {{ isLayoutDefault?: boolean }} [opts] Layout, das den Default DEFINIERT
 * @returns {{ line: number, key: string, reason: string }[]}
 */
export function scanContent(src, opts = {}) {
  // Ein Root-Layout DEFINIERT die Defaults — es muss sie nicht "mitgeben".
  // Erkennung: setzt `metadataBase` (nur das Root-Layout tut das).
  const isRootLayout = opts.isLayoutDefault ?? /\bmetadataBase\s*:/.test(src)
  if (isRootLayout) return []

  const code = stripCommentsAndStrings(src)
  const findings = []

  for (const key of ['openGraph', 'twitter']) {
    for (const block of extractBlocks(code, key)) {
      const guaranteed = stripSpreadConditionals(block.body)
      if (/\bimages\s*:/.test(guaranteed)) continue

      const conditional = /\bimages\s*:/.test(block.body)
      findings.push({
        line: lineOf(code, block.index),
        key,
        reason: conditional
          ? `${key}: \`images\` steht nur in einem Spread-Conditional — ohne den Zweig ersetzt der Block den Layout-Default ersatzlos`
          : `${key}: kein \`images\` — der Block ersetzt den des Layouts komplett, das Vorschaubild geht verloren`,
      })
    }
  }
  return findings
}

/**
 * @param {string[]} current Verletzer-Files jetzt
 * @param {string[]} baseline Verletzer-Files der Baseline
 */
export function diffBaseline(current, baseline) {
  const base = new Set(baseline)
  const neu = current.filter((f) => !base.has(f))
  const behoben = baseline.filter((f) => !current.includes(f))
  return { neu, behoben }
}
