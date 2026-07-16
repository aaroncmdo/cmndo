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

// ---------------------------------------------------------------------------
// Write-Pfad (statisch): .insert/.update/.upsert-Objektkeys gegen den Schema-
// Snapshot (scripts/lib/schema-snapshot.json). Ein Write laesst sich — anders
// als ein select — nicht nebenwirkungsfrei live proben; deshalb hier die
// statische Achse (laeuft auch in CI ohne DB-Keys). 0-FP-Disziplin wie oben:
// nur Objekt-LITERALE, Spread/computed Keys werden ignoriert (explizite Keys
// daneben trotzdem geprueft), Views + .schema()-Ketten werden uebersprungen.
// Design: docs/superpowers/specs/2026-07-16-query-parse-write-ratchet-design.md

function lineAt(src, index) {
  let line = 1
  const n = Math.min(index, src.length)
  for (let i = 0; i < n; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

function skipString(code, i) {
  // code[i] ist ' oder " — liefert Index NACH dem schliessenden Quote.
  const q = code[i]
  for (i++; i < code.length; i++) {
    if (code[i] === '\\') { i++; continue }
    if (code[i] === q) return i + 1
  }
  return code.length
}

function skipTemplate(code, i) {
  // code[i] ist ` — nesting-aware inkl. ${ … } (darin wieder Strings/Templates moeglich).
  for (i++; i < code.length; i++) {
    if (code[i] === '\\') { i++; continue }
    if (code[i] === '`') return i + 1
    if (code[i] === '$' && code[i + 1] === '{') {
      let depth = 1
      let j = i + 2
      while (j < code.length && depth > 0) {
        const c = code[j]
        if (c === "'" || c === '"') { j = skipString(code, j); continue }
        if (c === '`') { j = skipTemplate(code, j); continue }
        if (c === '{') depth++
        else if (c === '}') depth--
        j++
      }
      i = j - 1
    }
  }
  return code.length
}

/**
 * String-/template-awarer Walk ueber ein Objekt-Literal ab dem '{' bei openIdx.
 * Sammelt nur Tiefe-1-Keys (Identifier, quoted, Shorthand); Spread/computed/
 * Methoden-Shorthands liefern keinen Key, ihr Inhalt wird als Wert ueberlaufen.
 * @returns {{ end: number, keys: string[] }} end = Index NACH dem schliessenden '}'
 */
function scanObjectLiteral(code, openIdx) {
  const keys = []
  const n = code.length
  let i = openIdx + 1
  let depth = 1
  let mode = 'key'
  while (i < n && depth > 0) {
    const c = code[i]
    if (c === '`') { i = skipTemplate(code, i); continue }
    if (c === "'" || c === '"') {
      if (mode === 'key' && depth === 1) {
        // quoted Key: 'a-b': …
        let j = i + 1
        let k = ''
        while (j < n && code[j] !== c) {
          if (code[j] === '\\') { k += code[j + 1] ?? ''; j += 2; continue }
          k += code[j]
          j++
        }
        keys.push(k)
        i = j + 1
        mode = 'value'
        continue
      }
      i = skipString(code, i)
      continue
    }
    if (mode === 'key' && depth === 1) {
      if (c === '}') { depth--; i++; break }
      if (c === ',' || /\s/.test(c)) { i++; continue }
      if (c === '.' || c === '[') { mode = 'value'; continue } // Spread / computed → kein Key
      const im = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 200))
      if (im) {
        let j = i + im[0].length
        while (j < n && /\s/.test(code[j])) j++
        if (code[j] === ':') { keys.push(im[0]); i = j + 1; mode = 'value'; continue }
        if (code[j] === ',') { keys.push(im[0]); i = j + 1; continue } // Shorthand
        if (code[j] === '}') { keys.push(im[0]); i = j; continue } // Shorthand am Ende
        mode = 'value' // z.B. Methoden-Shorthand key(…){…} → kein Spalten-Key
        i = j
        continue
      }
      mode = 'value'
      continue
    }
    // value-Modus bzw. Tiefe > 1
    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; if (depth === 0) break; continue }
    if (c === ',' && depth === 1) { mode = 'key'; i++; continue }
    i++
  }
  return { end: i, keys }
}

function skipBalanced(code, openIdx) {
  // code[openIdx] ∈ ( [ { — liefert Index NACH dem passenden Gegenstueck (string-/template-aware).
  let depth = 0
  let i = openIdx
  while (i < code.length) {
    const c = code[i]
    if (c === "'" || c === '"') { i = skipString(code, i); continue }
    if (c === '`') { i = skipTemplate(code, i); continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i + 1 }
    i++
  }
  return code.length
}

/**
 * Writes NUR aus der KONTIGUEN Methodenkette ab `.from('<t>')` — also
 * `db.from('t').update({…}).eq(…)`, nicht ein spaeteres, statement-fremdes
 * `calendar.events.update({…})` (googleapis-Style; war die FP-Quelle beim
 * segment-weiten Scan). Builder-Variablen (`const q = db.from('t'); q.update(…)`)
 * werden bewusst NICHT erfasst — Under-Reporting statt False-Positive.
 * @param {string} src  Datei-Quelltext
 * @returns {{table: string, op: 'insert'|'update'|'upsert', keys: string[], line: number}[]}
 */
export function extractStaticWrites(src) {
  const clean = stripComments(src)
  const out = []
  const fromRe = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/gi
  let m
  while ((m = fromRe.exec(clean))) {
    const table = m[1]
    // .schema('x').from(…) → Nicht-public-Schema, Snapshot passt nicht → skip.
    if (/\.schema\(\s*['"`][^'"`]*['"`]\s*\)\s*$/.test(clean.slice(Math.max(0, m.index - 60), m.index))) continue
    // Kontigue Kette abwalken: nur direkt verkettete `.methode(…)`-Aufrufe.
    let pos = m.index + m[0].length
    while (pos < clean.length) {
      const cm = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(clean.slice(pos, pos + 200))
      if (!cm) break
      const method = cm[1]
      const openIdx = pos + cm[0].length - 1 // Index der '('
      const closeIdx = skipBalanced(clean, openIdx)
      if (method === 'insert' || method === 'update' || method === 'upsert') {
        const keys = []
        const addKeys = (ks) => { for (const k of ks) if (!keys.includes(k)) keys.push(k) }
        let a = openIdx + 1
        while (a < closeIdx && /\s/.test(clean[a])) a++
        if (clean[a] === '{') {
          addKeys(scanObjectLiteral(clean, a).keys)
        } else if (clean[a] === '[') {
          // Array-Form: alle Top-Level-Objekte innerhalb der Klammer.
          let j = a + 1
          let depth = 1
          while (j < closeIdx && depth > 0) {
            const c = clean[j]
            if (c === "'" || c === '"') { j = skipString(clean, j); continue }
            if (c === '`') { j = skipTemplate(clean, j); continue }
            if (c === '{' && depth === 1) { const r = scanObjectLiteral(clean, j); addKeys(r.keys); j = r.end; continue }
            if (c === '{' || c === '[' || c === '(') depth++
            else if (c === '}' || c === ']' || c === ')') depth--
            j++
          }
        }
        if (keys.length > 0) out.push({ table, op: method, keys, line: lineAt(clean, pos + cm.index + cm[0].indexOf('.')) })
      }
      pos = closeIdx
    }
  }
  return out
}

/**
 * @param {{table: string, op: string, keys: string[], line: number}[]} writes
 * @param {{tables: Record<string, {kind: string, columns: string[]}>}} snapshot
 * @returns {{table: string, column: string, op: string, line: number}[]}
 */
export function validateWrites(writes, snapshot) {
  const out = []
  for (const w of writes) {
    const t = snapshot.tables[w.table]
    if (!t) { out.push({ table: w.table, column: '(unknown table)', op: w.op, line: w.line }); continue }
    if (t.kind !== 't') continue // Views: updatable-View nicht statisch entscheidbar → skip
    const cols = new Set(t.columns)
    for (const k of w.keys) if (!cols.has(k)) out.push({ table: w.table, column: k, op: w.op, line: w.line })
  }
  return out
}

/** Stabiler Baseline-Key fuer Write-Verletzungen (file-/zeilen-unabhaengig). */
export function writeKey(table, column) {
  return `write::${table}::${column}`
}
