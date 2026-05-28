#!/usr/bin/env node
// Component-Set-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Verdachts-Files, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Migrationen)
// Pure Logik: scripts/lib/component-set-scan.mjs. Siehe AGENTS.md §Komponenten-Set.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/component-set-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'component-set-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/app/**/*.tsx" "src/components/**/*.tsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.includes('/components/ui/') &&
      !f.includes('/components/primitives/') &&
      !f.includes('/components/shared/'),
  )

const violating = []
for (const f of files) {
  const msg = scanContent(readFileSync(f, 'utf8'))
  if (msg) {
    violating.push(f)
    if (mode === 'warn') console.warn(`[component-set] ${f}: ${msg}`)
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
  console.log(`[component-set] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[component-set] FEHLER: keine Baseline. Erst `npm run check:component-set -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[component-set] ${added.length} NEUE handgerollte Komponente(n) — bitte primitives/shared nutzen:`)
    for (const f of added) console.error(`  + ${f}`)
    console.error('Wenn bewusst & unvermeidbar: Datei migrieren ODER (Ausnahme) Baseline via `-- --update-baseline` neu schreiben + im PR begruenden.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[component-set] ${removed.length} Verletzer behoben — Baseline kann gesenkt werden: \`npm run check:component-set -- --update-baseline\``)
  }
  console.log(`[component-set] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[component-set] ${violating.length} Datei(en) mit Drift-Verdacht (${files.length} geprueft). Policy: AGENTS.md §Komponenten-Set`,
)
process.exit(0)
