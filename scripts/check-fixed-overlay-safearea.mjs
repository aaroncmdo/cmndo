#!/usr/bin/env node
// Fixed-Overlay-Safe-Area-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Treffer, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Treffer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
// Pure Logik: scripts/lib/fixed-overlay-scan.mjs. Siehe AGENTS.md §Fixed-Overlay-Gate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanShellContent, scanCornerOverlayContent, diffBaseline } from './lib/fixed-overlay-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'fixed-overlay-safearea-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

// Zwei getrennte Mengen: shell = harter Vertrag (Baseline soll 0 bleiben),
// corner = grandfatherte Bestands-Overlays (nur NEUE sollen auffallen).
const shellViolations = []
const cornerViolations = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const shell = scanShellContent(src)
  if (shell) {
    shellViolations.push(f)
    if (mode === 'warn') console.warn(`[fixed-overlay] ${f}: ${shell}`)
  }
  const corner = scanCornerOverlayContent(src)
  if (corner) cornerViolations.push(f)
}
shellViolations.sort()
cornerViolations.sort()

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    shellCount: shellViolations.length,
    shellFiles: shellViolations,
    cornerCount: cornerViolations.length,
    cornerFiles: cornerViolations,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[fixed-overlay] Baseline aktualisiert: ${shellViolations.length} Shell-, ${cornerViolations.length} Ecken-Treffer -> ${BASELINE_PATH}`,
  )
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      '[fixed-overlay] FEHLER: keine Baseline. Erst `npm run check:fixed-overlay -- --update-baseline` laufen lassen.',
    )
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const shell = diffBaseline(shellViolations, baseline.shellFiles ?? [])
  const corner = diffBaseline(cornerViolations, baseline.cornerFiles ?? [])

  let rot = false
  if (shell.added.length > 0) {
    rot = true
    console.error(
      `[fixed-overlay] ${shell.added.length} Shell(s) mounten ein Ecken-Overlay OHNE Safe-Area — die letzte Inhaltszeile ist am Scroll-Ende nicht klickbar:`,
    )
    for (const f of shell.added) console.error(`  + ${f}`)
    console.error(
      'Fix: `lg:pb-20` auf das scrollende <main> dieser Shell (Gegenstueck zu .has-corner-pill, siehe globals.css + AGENTS.md §Fixed-Overlay-Gate).',
    )
  }
  if (corner.added.length > 0) {
    rot = true
    console.error(
      `[fixed-overlay] ${corner.added.length} NEUE(S) fixierte(s) Element(e) in der unteren rechten Ecke:`,
    )
    for (const f of corner.added) console.error(`  + ${f}`)
    console.error(
      'Persistentes Overlay? -> Safe-Area in den mountenden Shells sicherstellen + in OVERLAY_COMPONENTS (scripts/lib/fixed-overlay-scan.mjs) eintragen.',
    )
    console.error(
      'Fluechtig/harmlos (Toast, Drawer, Bubble)? -> `npm run check:fixed-overlay -- --update-baseline`.',
    )
  }
  if (rot) process.exit(1)

  if (shell.removed.length > 0 || corner.removed.length > 0) {
    console.log(
      `[fixed-overlay] ${shell.removed.length + corner.removed.length} Treffer behoben — Baseline kann gesenkt werden: \`npm run check:fixed-overlay -- --update-baseline\``,
    )
  }
  console.log(
    `[fixed-overlay] OK — ${shellViolations.length} Shell- (Baseline ${baseline.shellCount}), ${cornerViolations.length} Ecken-Treffer (Baseline ${baseline.cornerCount}), 0 neue.`,
  )
  process.exit(0)
}

// warn (default)
console.log(
  `[fixed-overlay] ${shellViolations.length} Shell(s) ohne Safe-Area, ${cornerViolations.length} Ecken-Overlay-File(s) (${files.length} .tsx geprueft). Policy: AGENTS.md §Fixed-Overlay-Gate`,
)
process.exit(0)
