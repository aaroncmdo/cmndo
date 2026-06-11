#!/usr/bin/env node
// Termin-Engine-Contract-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Verletzer-Files, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggü. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Migration)
// Pure Logik: scripts/lib/termin-engine-contract-scan.mjs.
// Regeln: src/lib/termine/engine/CONTRACT.md (querie gutachter_termine nicht direkt mit Legacy-Filtern).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/termin-engine-contract-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'termin-engine-contract-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

// Scan: alle src .ts/.tsx — AUSSER die Engine selbst (darf gutachter_termine direkt querien),
// der kanonische Lead-Helper (macht den sanktionierten Dual-Lookup) und Tests.
const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.startsWith('src/lib/termine/engine/') &&
      f !== 'src/lib/termine/finde-termin-fuer-lead.ts' &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx') &&
      !f.includes('/__tests__/'),
  )

const violating = []
for (const f of files) {
  const hits = scanContent(readFileSync(f, 'utf8'))
  if (hits.length > 0) {
    violating.push(f)
    if (mode === 'warn') {
      for (const h of hits) {
        console.warn(`[termin-engine-contract] ${f}:${h.line} [${h.rule}] → ${h.hint}`)
      }
    }
  }
}
violating.sort()

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: violating.length,
    files: violating,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[termin-engine-contract] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[termin-engine-contract] FEHLER: keine Baseline. Erst `npm run check:termin-engine-contract -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[termin-engine-contract] ${added.length} NEUE(r) direkte(r) Legacy-Filter auf gutachter_termine — Engine nutzen (CONTRACT.md):`)
    for (const f of added) {
      const hits = scanContent(readFileSync(f, 'utf8'))
      for (const h of hits) console.error(`  + ${f}:${h.line} [${h.rule}] → ${h.hint}`)
    }
    console.error('Wenn bewusst & unvermeidbar: Datei aufs Engine-API migrieren ODER (Ausnahme) Baseline via `-- --update-baseline` neu schreiben + im PR begruenden.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[termin-engine-contract] ${removed.length} Verletzer behoben — Baseline kann gesenkt werden: \`npm run check:termin-engine-contract -- --update-baseline\``)
  }
  console.log(`[termin-engine-contract] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[termin-engine-contract] ${violating.length} Datei(en) mit Contract-Drift-Verdacht (${files.length} geprueft). Regeln: src/lib/termine/engine/CONTRACT.md`,
)
process.exit(0)
