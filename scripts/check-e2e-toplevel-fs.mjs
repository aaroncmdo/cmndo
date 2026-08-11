#!/usr/bin/env node
// E2E-Toplevel-FS-Drift-Bremse. Drei Modi:
//   (default)         --warn   : listet Specs mit top-level readFileSync, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
// Pure Logik: scripts/lib/e2e-toplevel-fs-scan.mjs. Siehe AGENTS.md §E2E-Toplevel-FS-Gate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/e2e-toplevel-fs-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'e2e-toplevel-fs-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "tests/e2e/**/*.spec.ts"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const violating = []
for (const f of files) {
  // Defensiv lesen: `git ls-files` listet auch staged-but-deleted Files. Ein ungeschuetztes
  // readFileSync wuerde dann den CHECK crashen lassen -- ausgerechnet die Fragilitaet, die
  // dieser Guard verhindert (beim Selbsttest 11.08. prompt passiert). Nicht lesbar = kein
  // Verletzer (die Datei existiert nicht, also kann sie auch nichts crashen).
  let inhalt
  try {
    inhalt = readFileSync(f, 'utf8')
  } catch {
    continue
  }
  const treffer = scanContent(inhalt)
  if (treffer.length > 0) {
    violating.push(f)
    if (mode === 'warn') {
      console.warn(`[e2e-toplevel-fs] ${f}: top-level readFileSync (Z. ${treffer.map((t) => t.line).join(', ')})`)
    }
  }
}
violating.sort()

if (mode === 'update') {
  const payload = { generatedAt: new Date().toISOString(), count: violating.length, files: violating }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[e2e-toplevel-fs] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[e2e-toplevel-fs] FEHLER: keine Baseline. Erst `npm run check:e2e-toplevel-fs -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[e2e-toplevel-fs] ${added.length} NEUE Spec(s) mit top-level readFileSync — fehlt die Datei, crasht die GESAMTE Playwright-Collection (alle Journey-Smokes fallen mit aus):`)
    for (const f of added) console.error(`  + ${f}`)
    console.error("Fix: `let seed = null; try { seed = JSON.parse(readFileSync(...)) } catch {}` + `test.skip(!seed, '...')` im Test-Body (Muster: tests/e2e/flows/reparatur-funnel-abschluss-smoke.spec.ts). Echter Sonderfall -> `// e2e-toplevel-fs-skip: <grund>`.")
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[e2e-toplevel-fs] ${removed.length} Verletzer behoben — Baseline kann gesenkt werden: \`npm run check:e2e-toplevel-fs -- --update-baseline\``)
  }
  console.log(`[e2e-toplevel-fs] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(
  `[e2e-toplevel-fs] ${violating.length} Spec(s) mit top-level readFileSync (${files.length} Specs geprueft). Policy: AGENTS.md §E2E-Toplevel-FS-Gate`,
)
process.exit(0)
