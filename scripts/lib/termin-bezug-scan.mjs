// Pure Scan-Logik fuer check:termin-bezug — naive Legacy-Achsen-Filter auf gutachter_termine.
// Keine I/O -> unit-testbar (vitest). CLI-Wrapper: ../check-termin-bezug.mjs
//
// `gutachter_termine` traegt den Termin-Auftrag ("WOFÜR") auf ZWEI Achsen: Legacy (fall_id/
// lead_id/claim_id) + kanonisch (bezug_typ + bezug_id). Die Termin-Engine schreibt NEUE Termine
// bezug-nativ OHNE Legacy-Spalte. Ein naiver `.eq('fall_id', X)` uebersieht solche Termine
// (deren fall_id ist NULL). Fix: `.or(bezugOrExpr(achse, id))` aus src/lib/termine/bezug-filter.ts
// (Superset — matcht Legacy ODER bezug-nativ). Dieser Scanner faengt die verbleibenden naiven
// Filter fuer den Boy-Scout-Retire (Marker coordination-p33-gutachter-termine-legacy-retire).
//
// Tabellen-Aufloesung ueber das `.from('<table>')` der Kette (Segment bis zum naechsten .from()).
// Bewusst hoch-praezise (0 False-Positives, sonst wird der Ratchet disabled):
//   - nur FILTER `.eq/.neq/.in('(fall|lead|claim)_id', …)`, nur auf `gutachter_termine`.
//   - WRITES (`.insert/.update({ fall_id: … })`) werden NICHT geflaggt: Legacy-Spalten SCHREIBEN
//     ist legitim, solange die Spalten existieren — nur FILTER uebersehen bezug-native Zeilen.
//   - die kanonische Achse (`bezug_id`/`bezug_typ`) + andere id-Spalten (`assignee_id`/`id`/
//     `vehicle_id`) + die migrierte Form (`.or(bezugOrExpr(...))`) matchen per Konstruktion nie.

const TABLE = 'gutachter_termine'

function stripComments(src) {
  // Kommentar-Zeichen durch Spaces GLEICHER Laenge ersetzen (Newlines bleiben stehen) —
  // so bleiben Zeichen-Offsets + Zeilennummern identisch zum Original-src.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

function lineAt(src, index) {
  let line = 1
  const n = Math.min(index, src.length)
  for (let i = 0; i < n; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

/**
 * @param {string} src TS/TSX-Inhalt
 * @returns {Array<{line:number,table:string,achse:'fall'|'lead'|'claim',kind:'eq'|'neq'|'in'}>}
 */
export function scanContent(src) {
  const code = stripComments(src)
  const out = []

  const fromRe = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/gi
  const froms = []
  let f
  while ((f = fromRe.exec(code)) !== null) froms.push({ table: f[1], start: f.index })
  if (froms.length === 0) return out

  for (let i = 0; i < froms.length; i++) {
    const { table, start } = froms[i]
    if (table !== TABLE) continue
    const end = i + 1 < froms.length ? froms[i + 1].start : code.length
    const seg = code.slice(start, end)

    // FILTER auf eine Legacy-Achsen-Spalte: .eq/.neq('(fall|lead|claim)_id', …) | .in('…_id', […])
    const filterRe = /\.(eq|neq|in)\(\s*['"](fall|lead|claim)_id['"]/g
    let m
    while ((m = filterRe.exec(seg)) !== null) {
      out.push({ line: lineAt(src, start + m.index), table, achse: m[2], kind: m[1] })
    }
  }
  return out
}

export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((x) => !base.has(x)).sort(),
    removed: baselineFiles.filter((x) => !cur.has(x)).sort(),
  }
}
