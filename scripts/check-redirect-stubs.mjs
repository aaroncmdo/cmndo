#!/usr/bin/env node
// Redirect-Stub-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet reine Redirect-Stubs, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Stubs ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
// Pure Logik: scripts/lib/redirect-stub-scan.mjs. Siehe AGENTS.md §Redirect-Stub.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/redirect-stub-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'redirect-stub-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

// Alle page.tsx unter src/app (Route-Entry-Points).
const files = execSync('git ls-files "src/app/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => f.endsWith('/page.tsx'))

const violating = []
for (const f of files) {
  const msg = scanContent(readFileSync(f, 'utf8'))
  if (msg) {
    violating.push(f)
    if (mode === 'warn') console.warn(`[redirect-stub] ${f}: ${msg}`)
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
  console.log(`[redirect-stub] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[redirect-stub] FEHLER: keine Baseline. Erst `npm run check:redirect-stubs -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[redirect-stub] ${added.length} NEUE reine Redirect-Stub-page.tsx — die rendern auf prod eine LEERE Shell (kein Redirect, React #310):`)
    for (const f of added) console.error(`  + ${f}`)
    console.error('Fix: Route-Redirect als HTTP-308 in next.config.ts redirects() eintragen + die page.tsx LOESCHEN (Sub-Routen bleiben via Exakt-Match). Siehe AGENTS.md §Redirect-Stub + BROADCAST-redirect-stub-antipattern.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[redirect-stub] ${removed.length} Stub(s) behoben — Baseline kann gesenkt werden: \`npm run check:redirect-stubs -- --update-baseline\``)
  }
  console.log(`[redirect-stub] OK — ${violating.length} bekannte Stubs (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[redirect-stub] ${violating.length} reine Redirect-Stub-page.tsx (${files.length} page.tsx geprueft). Policy: AGENTS.md §Redirect-Stub`,
)
process.exit(0)
