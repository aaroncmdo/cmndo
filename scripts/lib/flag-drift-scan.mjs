// Pure Scan-Logik fuer check:flag-drift — CHECK-invalide Status-Literale.
// Keine I/O -> unit-testbar (vitest). CLI-Wrapper: ../check-flag-drift.mjs
//
// Faengt Writes/Filter, die ein status-artiges Spalten-Literal setzen/vergleichen,
// das NICHT im DB-CHECK der Spalte steht — z.B. .update({ status: 'geplant' }) auf
// gutachter_termine ('geplant' ist dort ungueltig -> Postgres verwirft das UPDATE ->
// stiller Fehlschlag; exakt der geplant/kunde_storniert-Incident 05.07.). Constraint-
// Quelle: scripts/lib/status-check-constraints.json (DB-Snapshot).
//
// Tabellen-Aufloesung: das .from('<table>') vor der Kette bestimmt die Spalten-Menge.
// Hoch-praezise (lieber ein False-Negative als ein False-Positive, sonst wird der
// Ratchet disabled): nur String-Literale (kein dynamischer Wert), nur bekannte
// CHECK-Spalten, und `col: 'lit'` nur INNERHALB einer .update/.insert/.upsert({...}).

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

// Ab dem '{' bei openIndex den passenden schliessenden '}' finden (Nesting-aware).
function matchBraces(code, openIndex) {
  let depth = 0
  for (let i = openIndex; i < code.length; i++) {
    const ch = code.charCodeAt(i)
    if (ch === 123) depth++ // {
    else if (ch === 125) { depth--; if (depth === 0) return i + 1 } // }
  }
  return code.length
}

/**
 * @param {string} src TS/TSX-Inhalt
 * @param {Record<string,string[]>} columns Map "table.column" -> erlaubte Werte
 * @returns {Array<{line:number,table:string,column:string,value:string,kind:'assign'|'filter'|'in'}>}
 */
export function scanContent(src, columns) {
  const code = stripComments(src)
  const out = []

  const fromRe = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/gi
  const froms = []
  let f
  while ((f = fromRe.exec(code)) !== null) froms.push({ table: f[1], start: f.index })
  if (froms.length === 0) return out

  for (let i = 0; i < froms.length; i++) {
    const { table, start } = froms[i]
    const end = i + 1 < froms.length ? froms[i + 1].start : code.length
    const seg = code.slice(start, end)

    const cols = Object.keys(columns)
      .filter((k) => k.startsWith(table + '.'))
      .map((k) => ({ col: k.slice(table.length + 1), allowed: new Set(columns[k]) }))
    if (cols.length === 0) continue

    // (a) col: 'literal' INNERHALB einer .update/.insert/.upsert({...})-Objektliteral.
    const mutRe = /\.(?:update|insert|upsert)\(\s*\{/g
    let mut
    while ((mut = mutRe.exec(seg)) !== null) {
      const braceStart = seg.indexOf('{', mut.index)
      if (braceStart < 0) continue
      const objEnd = matchBraces(seg, braceStart)
      const obj = seg.slice(braceStart, objEnd)
      for (const { col, allowed } of cols) {
        const kvRe = new RegExp(`(?<![\\w.])${col}\\s*:\\s*['"]([^'"\\n]+)['"]`, 'g')
        let a
        while ((a = kvRe.exec(obj)) !== null) {
          if (!allowed.has(a[1])) {
            out.push({ line: lineAt(src, start + braceStart + a.index), table, column: col, value: a[1], kind: 'assign' })
          }
        }
      }
    }

    for (const { col, allowed } of cols) {
      // (b) Filter .eq/.neq('col', 'literal')
      const eqRe = new RegExp(`\\.(?:eq|neq)\\(\\s*['"]${col}['"]\\s*,\\s*['"]([^'"\\n]+)['"]`, 'g')
      let b
      while ((b = eqRe.exec(seg)) !== null) {
        if (!allowed.has(b[1])) out.push({ line: lineAt(src, start + b.index), table, column: col, value: b[1], kind: 'filter' })
      }
      // (c) .in('col', ['a','b',...])
      const inRe = new RegExp(`\\.in\\(\\s*['"]${col}['"]\\s*,\\s*\\[([^\\]]*)\\]`, 'g')
      let c
      while ((c = inRe.exec(seg)) !== null) {
        const litRe = /['"]([^'"\n]+)['"]/g
        let l
        while ((l = litRe.exec(c[1])) !== null) {
          if (!allowed.has(l[1])) out.push({ line: lineAt(src, start + c.index), table, column: col, value: l[1], kind: 'in' })
        }
      }
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
