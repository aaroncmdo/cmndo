// Pure Extraktion statischer PostgREST-Queries aus TS/TSX-Quelltext.
// Kein I/O — nimmt Quelltext rein, gibt {table, select, line}[] raus. Unit-getestet.
//
// Findet `.from('<table>') … .select('<literal>')`, wobei das select zur SELBEN Kette gehört
// (kein weiteres `.from(` dazwischen). Überspringt bewusst, was nicht sicher rekonstruierbar ist:
//   - Kommentare (sonst matcht `.from('faelle')` aus einer Notiz)
//   - Template-Literals mit ${…}, konkatenierte (`'…' +`) und Wildcard-(`*`)-Selects
// Diese Konservativität hält den nachgelagerten Live-Trockenschuss False-Positive-frei.

// Block-/Line-Kommentar-Regexe als String gebaut (new RegExp): ein Regex-LITERAL mit der
// Sequenz Slash-Stern … Stern-Slash darin bringt esbuilds/vite import-analyzer zum Stolpern.
const BLOCK_COMMENT = new RegExp('/\\*[\\s\\S]*?\\*/', 'g')
const LINE_COMMENT = new RegExp('(^|[^:])//[^\\n]*', 'g')

/** Entfernt Block- und Zeilen-Kommentare, erhält aber die Zeilenzahl (für file:line). */
export function stripComments(src) {
  return src
    .replace(BLOCK_COMMENT, (m) => m.replace(/[^\n]/g, ' '))
    .replace(LINE_COMMENT, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

/**
 * @param {string} src  Datei-Quelltext
 * @returns {{table: string, select: string, line: number}[]}
 */
export function extractStaticQueries(src) {
  const clean = stripComments(src)
  const out = []
  const re = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/gi
  let m
  while ((m = re.exec(clean))) {
    const table = m[1]
    const after = clean.slice(m.index + m[0].length, m.index + m[0].length + 1500)
    const selIdx = after.indexOf('.select(')
    if (selIdx === -1) continue
    // Gehört das .select noch zu DIESER Kette? (kein weiteres .from dazwischen)
    if (/\.from\(/.test(after.slice(0, selIdx))) continue
    const sm = after.slice(selIdx).match(/^\.select\(\s*(['"`])([\s\S]*?)\1/)
    if (!sm) continue
    const select = sm[2]
    const tail = after.slice(selIdx + sm[0].length, selIdx + sm[0].length + 12)
    // Nicht sicher rekonstruierbar → überspringen (kein FP-Risiko im Trockenschuss).
    if (select.includes('${') || /^\s*\+/.test(tail) || select.includes('*') || !select.trim()) continue
    out.push({ table, select: select.replace(/\s+/g, ' ').trim(), line: clean.slice(0, m.index).split('\n').length })
  }
  return out
}

/** Stabiler Baseline-Key: unabhängig von file:line, damit die Baseline nicht bei Zeilenshift driftet. */
export function queryKey(table, select) {
  return `${table}::${select.replace(/\s+/g, '')}`
}
