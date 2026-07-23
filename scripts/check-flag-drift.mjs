#!/usr/bin/env node
// Flag-Drift-Bremse (check:flag-drift). Faengt CHECK-invalide Status-Literale in
// Supabase-Writes/Filtern — z.B. .update({ status: 'geplant' }) auf gutachter_termine,
// wo 'geplant' nicht im CHECK steht: Postgres verwirft das UPDATE -> STILLER Fehlschlag
// (exakt der geplant/kunde_storniert-Incident 05.07., den kein Build/tsc faengt).
//
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Fixes / Grandfathering)
//
// Pure Logik: scripts/lib/flag-drift-scan.mjs.
// Constraint-Snapshot: scripts/lib/status-check-constraints.json (aus der Live-DB gezogen).
//   VOLLABDECKUNG (22.07.): ALLE public ANY-ARRAY-enum-CHECKs — nicht mehr nur status-benannte.
//   Motiv: der frühere conname-ILIKE-'%status%'-Filter deckte nur ~1/3 der enum-Spalten ab; die
//   Lücke verbarg einen Silent-Write-Fail (nachrichten.kanal='system', Reminder-Bug). Jetzt fängt
//   das Gate JEDEN CHECK-invaliden enum-Literal (schadenart, abrechnungsweg, kanal, …).
//   REGENERATION (neuer/geänderter enum-CHECK per MCP-Migration; Wert IMMER zuerst in den CHECK):
//   → `node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs` (via RPC
//     audit_enum_check_constraints; naechtlich auto via .github/workflows/schema-snapshot-regen.yml).
//   Das SQL unten ist das manuelle Aequivalent (Debug / ohne Script):
//   SELECT cls.relname AS tbl,
//     (regexp_match(pg_get_constraintdef(con.oid), '\(([a-z_][a-z0-9_]*) = ANY'))[1] AS col,
//     (SELECT string_agg(m[1], ',' ORDER BY m[1])
//        FROM regexp_matches(pg_get_constraintdef(con.oid), '''([^'']+)''::', 'g') AS m) AS vals
//   FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid
//   JOIN pg_namespace ns ON ns.oid=cls.relnamespace
//   WHERE con.contype='c' AND ns.nspname='public'
//     AND pg_get_constraintdef(con.oid) ILIKE '%= ANY (ARRAY[%'
//     AND (regexp_match(pg_get_constraintdef(con.oid), '\(([a-z_][a-z0-9_]*) = ANY'))[1] IS NOT NULL
//   ORDER BY 1,2;
//   -> je Zeile "tbl.col": vals.split(',') in die columns-Map. (Digit-Spalten wie zb1_status
//      brauchen [a-z0-9_] im Regex; NULL-OR-Wrapper im def stört nicht, col steht vor '= ANY'.)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/flag-drift-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'flag-drift-baseline.json')
const CONSTRAINTS_PATH = join(__dirname, 'lib', 'status-check-constraints.json')

const columns = JSON.parse(readFileSync(CONSTRAINTS_PATH, 'utf8')).columns

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx') &&
      !f.includes('/__tests__/') &&
      f !== 'src/lib/supabase/database.types.ts',
  )

const violating = []
const hitsByFile = new Map()
for (const f of files) {
  const hits = scanContent(readFileSync(f, 'utf8'), columns)
  if (hits.length > 0) {
    violating.push(f)
    hitsByFile.set(f, hits)
    if (mode === 'warn') {
      for (const h of hits) {
        console.warn(`[flag-drift] ${f}:${h.line} ${h.table}.${h.column} = '${h.value}' (${h.kind}) — nicht im CHECK`)
      }
    }
  }
}
violating.sort()

if (mode === 'update') {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: violating.length, files: violating }, null, 2) + '\n',
  )
  console.log(`[flag-drift] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[flag-drift] FEHLER: keine Baseline. Erst `npm run check:flag-drift -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[flag-drift] ${added.length} NEUE Datei(en) mit CHECK-invaliden Status-Literalen (Postgres verwirft solche Writes -> stiller Fehlschlag):`)
    for (const f of added) {
      for (const h of hitsByFile.get(f) ?? []) console.error(`  + ${f}:${h.line} ${h.table}.${h.column} = '${h.value}' (${h.kind})`)
    }
    console.error('Fix: gueltigen Wert aus dem CHECK nutzen (scripts/lib/status-check-constraints.json). Neuer Wert gewollt? -> erst CHECK per MCP-Migration erweitern + Snapshot regenerieren (SQL im check-flag-drift.mjs-Header).')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[flag-drift] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:flag-drift -- --update-baseline\``)
  }
  console.log(`[flag-drift] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[flag-drift] ${violating.length} Datei(en) mit CHECK-invaliden Status-Literalen (${files.length} geprueft). --ratchet gatet neue.`)
process.exit(0)
