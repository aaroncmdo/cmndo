// Pure Scan-Logik fuer check:silent-writes — Supabase-Writes, deren Ergebnis niemand liest.
// Keine I/O -> unit-testbar (vitest). CLI-Wrapper: ../check-silent-writes.mjs
//
// DIE FEHLERKLASSE: `supabase-js` WIRFT NICHT. Ein fehlgeschlagener Write gibt `{ error }`
// zurueck — wer den Rueckgabewert nicht liest, kann Erfolg und Fehlschlag nicht unterscheiden:
//
//   await db.from('claims').update({ … }).eq('id', id)        // ❌ Fehler unsichtbar
//   const { error } = await db.from('claims').update({ … })   // ✅
//
// Belegte Vorfaelle:
//   * DSGVO-Storno (19.07.): 0-Row-UPDATE unter RLS -> Action meldete Erfolg, der Loeschauftrag
//     lief weiter. RLS-gefilterte Writes sind der stille Sonderfall (error === null, 0 Rows) —
//     dafuer braucht es zusaetzlich `.select()` + Row-Check.
//   * J2-Seed (16.08.): FK-Verletzung beim Lead-DELETE. Der Seed meldete 13 Tage lang Erfolg
//     und loeschte nichts; 88 Leads liefen auf.
//   * Skizzen-Korrektur (16.08.): Task-Insert im try/catch (faengt nichts, da kein throw) +
//     Update ohne Pruefung — im selben File, am selben Tag wie der J2-Fix.
//
// GESCANNT WIRD NUR DIE STATEMENT-FORM: eine Zeile, die (nach Whitespace) mit `await` beginnt.
// `const { error } = await …`, `return await …`, `void (async () => …)` beginnen anders und
// werden per Konstruktion nie geflaggt — das haelt die False-Positive-Rate bei ~0, was
// Voraussetzung ist: ein Ratchet mit Fehlalarmen blockiert die ganze Fleet und wird abgeschaltet.
//
// NUR SCHADENSTRAECHTIGE TABELLEN (bewusst nicht alle ~684 Write-Stellen des Repos): dort ist
// ein stiller Fehlschlag ein Datenverlust, der erst Wochen spaeter als "warum steht der Fall
// noch da?" auffaellt. Die Liste darf wachsen — jede Erweiterung hebt aber die Baseline.

/** Tabellen, bei denen ein unbemerkter Write echten Schaden anrichtet. */
export const KRITISCHE_TABELLEN = [
  'claims',
  'leads',
  'tasks',
  'faelle',
  'fall_dokumente',
  'pflichtdokumente',
  'gutachter_termine',
]

const WRITE_METHODEN = ['insert', 'update', 'upsert', 'delete']

export const SKIP_MARKER = 'silent-write-skip:'

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
 * Extrahiert die Methodenkette ab `start` (Position des `await`).
 *
 * Das Projekt schreibt ohne Semikolons — die Kette endet also nicht an `;`, sondern dort, wo
 * alle Klammern geschlossen sind UND die naechste nicht-leere Zeile nicht mit `.` weitergeht.
 * Genau so laufen die mehrzeiligen Ketten (`await db\n  .from(…)\n  .update(…)`).
 */
function ketteAb(code, start) {
  let tiefe = 0
  let i = start
  for (; i < code.length; i++) {
    const c = code[i]
    if (c === '(' || c === '[' || c === '{') tiefe++
    else if (c === ')' || c === ']' || c === '}') tiefe--
    else if (c === '\n' && tiefe <= 0) {
      // Zeilenende auf Klammer-Ebene 0: geht die Kette in der naechsten Zeile weiter?
      const rest = code.slice(i + 1)
      const naechste = rest.match(/^\s*/)[0].length
      if (rest[naechste] !== '.') break
    }
    if (tiefe < 0) break // schliessende Klammer des umgebenden Blocks -> Statement ist zu Ende
  }
  return code.slice(start, i)
}

/**
 * @param {string} src TS/TSX-Inhalt
 * @returns {Array<{line:number, table:string, methode:string}>}
 */
export function scanContent(src) {
  if (src.includes(SKIP_MARKER)) return []
  const code = stripComments(src)
  const out = []

  // Statement-Anfang: Zeilenbeginn + optional Whitespace + `await` + Bezeichner.
  const awaitRe = /^[ \t]*await\s+[A-Za-z_$][\w$]*/gm
  let m
  while ((m = awaitRe.exec(code)) !== null) {
    const kette = ketteAb(code, m.index)

    // Die Kette muss GENAU EIN `.from()` haben — bei mehreren ist die Zuordnung von
    // Tabelle zu Write-Methode nicht mehr eindeutig, und Raten waere ein Fehlalarm.
    const froms = [...kette.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/gi)]
    if (froms.length !== 1) continue

    const table = froms[0][1]
    if (!KRITISCHE_TABELLEN.includes(table)) continue

    const methode = WRITE_METHODEN.find((w) =>
      new RegExp(`\\.${w}\\s*\\(`).test(kette.slice(froms[0].index)),
    )
    if (!methode) continue

    out.push({ line: lineAt(code, m.index), table, methode })
  }
  return out
}

/**
 * @param {string[]} aktuell Verletzer-Files jetzt
 * @param {string[]} baseline Verletzer-Files der Baseline
 * @returns {{neu: string[], behoben: string[]}}
 */
export function diffBaseline(aktuell, baseline) {
  const b = new Set(baseline)
  const a = new Set(aktuell)
  return {
    neu: aktuell.filter((f) => !b.has(f)).sort(),
    behoben: baseline.filter((f) => !a.has(f)).sort(),
  }
}
