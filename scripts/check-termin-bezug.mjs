#!/usr/bin/env node
// Termin-Bezug-Drift-Bremse (check:termin-bezug). Faengt naive Legacy-Achsen-Filter auf
// `gutachter_termine` (.eq/.neq/.in('fall_id'|'lead_id'|'claim_id')), die bezug-native Termine
// uebersehen (bezug_typ+bezug_id, Legacy-Spalte NULL). Fix: .or(bezugOrExpr(achse, id)) aus
// src/lib/termine/bezug-filter.ts (Superset). Ergaenzt check:termin-engine-contract, das nur
// .eq('lead_id')/.eq('sv_id') (Engine-API-Disziplin) gated.
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Fixes)
// Pure Logik: scripts/lib/termin-bezug-scan.mjs. Skip pro File: `// termin-bezug-skip: <grund>`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/termin-bezug-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'termin-bezug-baseline.json')

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
      // Ausnahmen analog check:termin-engine-contract (die duerfen die Achsen direkt anfassen):
      !f.startsWith('src/lib/termine/engine/') && // Engine = Achsen-Autoritaet (schreibt Dual-Write-Bruecke)
      f !== 'src/lib/termine/finde-termin-fuer-lead.ts' && // sanktionierter Dual-Lookup (lead_id ∪ bezug)
      f !== 'src/lib/termine/bezug-filter.ts' && // der Helper selbst
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx') &&
      !f.includes('/__tests__/'),
  )

const violating = []
const hitsByFile = new Map()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (/\/\/\s*termin-bezug-skip:/.test(src)) continue // dokumentierter Legacy-only-Sonderfall
  const hits = scanContent(src)
  if (hits.length > 0) {
    violating.push(f)
    hitsByFile.set(f, hits)
    if (mode === 'warn') {
      for (const h of hits) {
        console.warn(
          `[termin-bezug] ${f}:${h.line} .${h.kind}('${h.achse}_id') — uebersieht bezug-native Termine; nutze .or(bezugOrExpr('${h.achse}', id))`,
        )
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
  console.log(`[termin-bezug] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[termin-bezug] FEHLER: keine Baseline. Erst `npm run check:termin-bezug -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[termin-bezug] ${added.length} NEUE Datei(en) mit naiven Legacy-Filtern auf gutachter_termine (uebersehen bezug-native Termine):`)
    for (const f of added) {
      for (const h of hitsByFile.get(f) ?? []) console.error(`  + ${f}:${h.line} .${h.kind}('${h.achse}_id')`)
    }
    console.error("Fix: .or(bezugOrExpr('<achse>', id)) aus @/lib/termine/bezug-filter. Bewusst Legacy-only? -> `// termin-bezug-skip: <grund>`-Header.")
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[termin-bezug] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:termin-bezug -- --update-baseline\``)
  }
  console.log(`[termin-bezug] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[termin-bezug] ${violating.length} Datei(en) mit naiven gutachter_termine-Legacy-Filtern (${files.length} geprueft). --ratchet gatet neue.`)
process.exit(0)
