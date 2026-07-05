#!/usr/bin/env node
// Status-Registry-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Verdachts-Files, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Migrationen)
// Pure Logik: scripts/lib/status-registry-scan.mjs. Siehe AGENTS.md §status-registry.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/status-registry-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'status-registry-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

// Scope: app + components, OHNE ui/primitives/shared (dort leben die
// sanktionierten Badge-Komponenten) und OHNE Tests. Die zentralen Maps
// (src/lib/statusLabels.ts, src/lib/status/*, shared/claims/*) liegen
// ausserhalb dieses Globs = bewusst exempt.
const files = execSync(
  'git ls-files "src/app/**/*.ts" "src/app/**/*.tsx" "src/components/**/*.ts" "src/components/**/*.tsx"',
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.includes('/components/ui/') &&
      !f.includes('/components/primitives/') &&
      !f.includes('/components/shared/') &&
      !/\.(test|spec)\.tsx?$/.test(f),
  )

const violating = []
for (const f of files) {
  const msg = scanContent(readFileSync(f, 'utf8'))
  if (msg) {
    violating.push(f)
    if (mode === 'warn') console.warn(`[status-registry] ${f}: ${msg}`)
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
  console.log(`[status-registry] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[status-registry] FEHLER: keine Baseline. Erst `npm run check:status-registry -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[status-registry] ${added.length} NEUE inline Status-/Farb-Map(s) — bitte @/lib/status nutzen:`)
    for (const f of added) console.error(`  + ${f}`)
    console.error('Registry-Domain ergaenzen + <StatusBadge domain=.../> bzw. resolveStatus/statusSlotClass nutzen.')
    console.error('Legit-Nicht-Status (Chart-/Kategorie-Palette)? -> `// status-registry-skip: <grund>`-Header ODER (Ausnahme) Baseline via `-- --update-baseline` neu schreiben + im PR begruenden.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[status-registry] ${removed.length} Verletzer behoben — Baseline kann gesenkt werden: \`npm run check:status-registry -- --update-baseline\``)
  }
  console.log(`[status-registry] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[status-registry] ${violating.length} Datei(en) mit inline Status-Farb-Logik (${files.length} geprueft). Policy: AGENTS.md §status-registry`,
)
process.exit(0)
