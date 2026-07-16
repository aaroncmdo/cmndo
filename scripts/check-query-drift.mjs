// check:query-drift — Ratchet gegen Query-Spalten-Drift (16.07.2026, Prod-Error-Sweep).
//
// Prueft ALLE statischen PostgREST-Query-Ketten in src/ gegen die eingecheckte
// Schema-Wahrheit (src/lib/supabase/database.types.ts) — CI-faehig OHNE DB-Zugriff.
// Faengt die Klassen, die im Go-Live-Fenster wiederholt stille Prod-Bugs erzeugten
// (#4396/#4420/#4452/#4455: LexDrive-Anhaenge, Pflicht-Slots nie 'hochgeladen',
// Kanzlei-Wunsch blockiert, KB-Kundentermine luden nie, Abrechnung 'Unbekannt'):
//
//   (a) Filter-/Order-PARAMS:  .order('col') / .eq('col',..) / .gt(..) usw.
//   (b) INSERT/UPDATE/UPSERT-Objekt-Keys
//   (c) top-level select('...')-Spalten (ohne Embeds — Embed-Hints prueft
//       check:query-parse gegen die echte DB, s. scripts/check-query-parse.mjs)
//
// WICHTIG: database.types.ts kann der DB NACHHINKEN (neue Migrationen ohne
// Types-Regen). Deshalb Ratchet-Prinzip mit Baseline: bekannte Findings sind in
// scripts/query-drift-baseline.json eingefroren; das Gate blockt nur NEUE.
// Ein Finding heisst also: entweder (1) echte Drift -> Query fixen, oder
// (2) Spalte existiert in der DB, fehlt nur in den Types -> Types regenerieren
// (supabase gen types) ODER bewusst per --update-baseline aufnehmen.
//
// Modi:
//   node scripts/check-query-drift.mjs                     Report (exit 0)
//   node scripts/check-query-drift.mjs -- --ratchet        Gate: exit 1 bei NEUEN Findings
//   node scripts/check-query-drift.mjs -- --update-baseline  Baseline neu schreiben
//
// Verwandt: check:query-parse (DB-Trockenschuss fuer select-/Embed-Parsing, braucht
// .env.local -> nicht in CI) — beide zusammen decken die Drift-Klasse komplett ab.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts', 'query-drift-baseline.json')
const args = process.argv.slice(2)
const RATCHET = args.includes('--ratchet')
const UPDATE = args.includes('--update-baseline')

// ── 1) Schema aus database.types.ts (Tables + Views -> Row-Spalten) ─────────
const typesSrc = readFileSync(join(ROOT, 'src/lib/supabase/database.types.ts'), 'utf8')
const schema = {}
{
  const lines = typesSrc.split('\n')
  let section = null
  let table = null
  let inRow = false
  for (const line of lines) {
    const mSec = line.match(/^    (Tables|Views): \{/)
    if (mSec) { section = mSec[1]; table = null; inRow = false; continue }
    if (/^    \}/.test(line)) { section = null; table = null; inRow = false; continue }
    if (!section) continue
    const mTab = line.match(/^      (\w+): \{/)
    if (mTab) { table = mTab[1]; schema[table] ??= new Set(); inRow = false; continue }
    if (!table) continue
    if (/^        Row: \{/.test(line)) { inRow = true; continue }
    if (inRow) {
      if (/^        \}/.test(line)) { inRow = false; continue }
      const mCol = line.match(/^ {10}(\w+)\??:/)
      if (mCol) schema[table].add(mCol[1])
    }
  }
}
if (Object.keys(schema).length < 50) {
  console.error('[query-drift] database.types.ts-Parse verdaechtig klein — Format geaendert? Abbruch.')
  process.exit(2)
}

// ── 2) String-aware Hilfen ───────────────────────────────────────────────────
/** Ueberspringt ab src[i] (Quote-Zeichen) den String; liefert Index NACH dem Ende. */
function skipString(src, i) {
  const q = src[i]
  i++
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === q) return i + 1
    i++
  }
  return i
}

/** Ueberspringt ab src[i] einen Kommentar (// bis \n bzw. /* bis Ende); sonst i. */
function skipComment(src, i) {
  if (src[i] !== '/') return i
  if (src[i + 1] === '/') { const nl = src.indexOf('\n', i); return nl === -1 ? src.length : nl + 1 }
  if (src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); return end === -1 ? src.length : end + 2 }
  return i
}

/**
 * Liest ab offset (zeigt auf '(') den kompletten Argument-Block der Methode —
 * string-aware Klammerzaehler. Liefert { args, end } (end = Index NACH ')').
 */
function readArgs(src, offset) {
  let depth = 0
  let i = offset
  const start = offset + 1
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i); continue }
    if (c === '/') { const j = skipComment(src, i); if (j !== i) { i = j; continue } }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0) return { args: src.slice(start, i), end: i + 1 }
    }
    i++
  }
  return { args: src.slice(start), end: src.length }
}

/**
 * Top-Level-Keys eines Objekt-Literals (string-/kommentar-aware, Tiefe 1).
 * expectKey-Logik: nach einem Key wird der WERT bis zum Tiefe-1-Komma konsumiert —
 * sonst wuerden Ternary-Doppelpunkte in Werten (`x ? fall.sv_id : y`) als Keys gelesen.
 */
function topLevelKeys(objSrc) {
  const keys = []
  let depth = 0
  let i = 0
  let expectKey = true
  while (i < objSrc.length) {
    const c = objSrc[i]
    if (c === "'" || c === '"' || c === '`') { i = skipString(objSrc, i); continue }
    if (c === '/') { const j = skipComment(objSrc, i); if (j !== i) { i = j; continue } }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; if (depth <= 0) break; continue }
    if (depth === 1) {
      if (c === ',') { expectKey = true; i++; continue }
      if (expectKey) {
        const m = objSrc.slice(i).match(/^\s*(\w+)\s*:/)
        if (m) { keys.push(m[1]); i += m[0].length; expectKey = false; continue }
        // Spread/Shorthand/Whitespace: bis zum naechsten Komma ist das kein Key
        if (!/\s/.test(c)) expectKey = false
      }
    }
    i++
  }
  return keys
}

// ── 3) Query-Ketten scannen ──────────────────────────────────────────────────
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) { if (e !== 'node_modules' && e !== '__tests__') yield* walk(p) }
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) yield p
  }
}

const FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order'])
const WRITE_METHODS = new Set(['insert', 'update', 'upsert'])
const findings = new Map() // signatur -> {file, line, table, col, kind}
let chains = 0

for (const file of walk(join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('.from(')) continue
  const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
  const fromRe = /\.from\(\s*['"](\w+)['"]\s*\)/g
  let m
  while ((m = fromRe.exec(src))) {
    const table = m[1]
    const cols = schema[table]
    if (!cols) continue // storage-Buckets / dynamisch / unbekannt -> nicht pruefbar
    chains++
    // Method-Chain ab dem from(...) methodenweise parsen; Ende: kein '.' mehr.
    let i = m.index + m[0].length
    const report = (col, kind, at) => {
      if (cols.has(col)) return
      const line = src.slice(0, at).split('\n').length
      const sig = `${rel}|${table}.${col}|${kind}`
      if (!findings.has(sig)) findings.set(sig, { file: rel, line, table, col, kind })
    }
    for (;;) {
      const rest = src.slice(i)
      const mm = rest.match(/^\s*\.\s*(\w+)/)
      if (!mm) break
      const method = mm[1]
      const parenAt = i + mm[0].length + (rest.slice(mm[0].length).match(/^\s*/)?.[0].length ?? 0)
      if (src[parenAt] !== '(') { i = parenAt; continue }
      const { args, end } = readArgs(src, parenAt)
      if (FILTER_METHODS.has(method)) {
        const a = args.match(/^\s*['"]([\w.]+)['"]/)
        if (a && !a[1].includes('.') && !/foreignTable|referencedTable/.test(args)) {
          report(a[1], method, parenAt)
        }
      } else if (WRITE_METHODS.has(method)) {
        const objStart = args.match(/^\s*(\[\s*)?\{/)
        if (objStart) {
          const inner = args.slice(args.indexOf('{'))
          for (const k of topLevelKeys(inner)) report(k, method, parenAt)
        }
      } else if (method === 'select') {
        const s = args.match(/^\s*['"`]([^'"`]*)['"`]/)
        if (s && !s[1].includes('(')) {
          for (const raw of s[1].split(',')) {
            let part = raw.trim()
            if (!part || part === '*' || /[!()>\s*]/.test(part)) continue
            if (part.includes(':')) part = part.split(':')[1]?.trim() ?? '' // alias:col -> col
            if (/^\w+$/.test(part)) report(part, 'select', parenAt)
          }
        }
      }
      i = end
    }
  }
}

// ── 4) Baseline + Gate ───────────────────────────────────────────────────────
const current = [...findings.keys()].sort()
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : []
const baselineSet = new Set(baseline)
const neu = current.filter((s) => !baselineSet.has(s))
const geloest = baseline.filter((s) => !findings.has(s))

console.log(`[query-drift] ${Object.keys(schema).length} Tabellen/Views · ${chains} Query-Ketten · ${current.length} Findings (Baseline: ${baseline.length})`)

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(`[query-drift] Baseline aktualisiert -> ${current.length} Eintraege`)
  process.exit(0)
}

if (geloest.length) {
  console.log(`\n[query-drift] ${geloest.length} Baseline-Eintraege nicht mehr vorhanden (gefixt/Types-Regen) — mit --update-baseline aufraeumen:`)
  for (const s of geloest.slice(0, 10)) console.log(`  - ${s}`)
}

if (neu.length) {
  console.log(`\n[query-drift] ${RATCHET ? '❌' : '⚠'} ${neu.length} NEUE Finding(s):`)
  for (const s of neu) {
    const f = findings.get(s)
    console.log(`  ${f.file}:${f.line}  ${f.table}.${f.col}  [${f.kind}]`)
  }
  console.log(`\n  -> Spalte gegen prod pruefen (information_schema). Echte Drift: Query fixen.`)
  console.log(`  -> Spalte existiert, fehlt nur in database.types.ts: Types regenerieren`)
  console.log(`     oder bewusst: npm run check:query-drift -- --update-baseline`)
  if (RATCHET) process.exit(1)
} else {
  console.log('[query-drift] ✅ keine neuen Findings')
}
