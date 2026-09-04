#!/usr/bin/env node
// Stumme-Waechter-Drift-Bremse.
//   (default)         --warn   : listet ENV-gegatete Specs ohne gesetzten Schalter, exit 0
//   --ratchet                  : exit 1 wenn NEUE stumme Waechter ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
//
// Ein Test hinter `test.skip(!process.env.RUN_X, …)` laeuft nur, wenn RUN_X gesetzt wird.
// Steht der Schalter in KEINEM Workflow, meldet sich der Waechter nie — und faellt nicht
// auf, weil er als `skipped` zaehlt statt als `failed`. Begruendung + Messung: siehe
// scripts/lib/stumme-waechter-scan.mjs.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanne, diffBaseline, schluessel } from './lib/stumme-waechter-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'stumme-waechter-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function lies(pfad) {
  try {
    return readFileSync(pfad, 'utf8')
  } catch {
    return null // git ls-files listet auch staged-but-deleted Files
  }
}

const specDateien = execSync('git ls-files "tests/e2e/**/*.ts"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const specs = specDateien
  .map((datei) => ({ datei, inhalt: lies(datei) }))
  .filter((s) => s.inhalt !== null)

// ALLE Workflows, nicht nur ci.yml: ein Schalter darf auch in einem separaten
// Cron-/Dispatch-Workflow gesetzt sein — dann ist der Waechter nicht stumm.
const workflowDateien = execSync('git ls-files ".github/workflows/*.yml" ".github/workflows/*.yaml"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
const workflowInhalte = workflowDateien.map(lies).filter((i) => i !== null)

const treffer = scanne(specs, workflowInhalte)

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: treffer.length,
    eintraege: treffer.map(schluessel),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[stumme-waechter] Baseline aktualisiert: ${treffer.length} Eintraege -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[stumme-waechter] FEHLER: keine Baseline. Erst `npm run check:stumme-waechter -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const neu = diffBaseline(treffer, baseline.eintraege ?? [])
  if (neu.length > 0) {
    console.error(`[stumme-waechter] ${neu.length} NEUE(R) stumme(r) Waechter — der Test laeuft nirgends und meldet sich als \`skipped\`, nicht als \`failed\`:`)
    for (const k of neu) console.error(`  + ${k}`)
    console.error('Fix: den Schalter in die `env:` des passenden Workflow-Jobs aufnehmen — ABER VORHER pruefen, ob der Test damit ueberhaupt gruen laeuft (er braucht evtl. weitere Secrets/Fixtures). Bewusst manuell -> `// stumme-waechter-skip: <grund>`.')
    process.exit(1)
  }
  const behoben = (baseline.eintraege ?? []).length - treffer.length
  if (behoben > 0) {
    console.log(`[stumme-waechter] ${behoben} Waechter reaktiviert — Baseline kann gesenkt werden: \`npm run check:stumme-waechter -- --update-baseline\``)
  }
  console.log(`[stumme-waechter] OK — ${treffer.length} bekannte stumme Waechter (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
if (treffer.length > 0) {
  console.log(`[stumme-waechter] ${treffer.length} ENV-gegatete Spec(s) ohne gesetzten Schalter:`)
  for (const t of treffer) console.log(`  ${t.datei}  ->  ${t.schalter}`)
}
console.log(
  `[stumme-waechter] ${treffer.length} stumme Waechter (${specs.length} Specs, ${workflowInhalte.length} Workflows geprueft). Policy: AGENTS.md §Stumme-Waechter-Gate`,
)
process.exit(0)
