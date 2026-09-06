#!/usr/bin/env node
// Stumme-Waechter-Drift-Bremse.
//   (default)         --warn   : listet stumme Waechter, exit 0
//   --ratchet                  : exit 1 wenn NEUE stumme Waechter ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
//
// Zwei Achsen (Begruendung + Messung: scripts/lib/stumme-waechter-scan.mjs):
//   1. Ein Test hinter `test.skip(!process.env.RUN_X, …)` laeuft nur, wenn RUN_X gesetzt wird.
//      Steht der Schalter in KEINEM Workflow, meldet sich der Waechter nie — und faellt nicht
//      auf, weil er als `skipped` zaehlt statt als `failed`.
//   2. Ein `scripts/check-*.mjs`, das kein Workflow aufruft (weder per npm-Key noch per
//      Dateiname), laeuft nie — und faellt nicht auf, weil ein nicht aufgerufenes Skript
//      keinen roten Lauf erzeugt (check-copy-lint.mjs, #5862 → #5876).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanne, skripteOhneAufrufer, diffBaseline, schluessel, KEIN_AUFRUFER } from './lib/stumme-waechter-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'stumme-waechter-baseline.json')

// Bewusst manuelle Werkzeuge — mit Grund, nicht als Baseline-Schuld. Ein echtes Gate gehoert
// NICHT hierher, sondern in einen Workflow-Step (oder in die Baseline, bis entschieden ist,
// ob es verdrahtet oder geloescht wird).
const SKRIPT_ALLOWLIST = {
  'scripts/check-console-errors.mjs':
    'manuelles Debug-Werkzeug mit Routen-Argument (Console-/Network-/Page-Error-Logger), kein Gate',
  'scripts/check-memory-pr-status.mjs':
    'lokales Werkzeug: prueft den memory/-Index ausserhalb des Repos gegen GitHub, nie in CI',
}

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

function lsFiles(muster) {
  return execSync(`git ls-files ${muster}`, { encoding: 'utf8' }).split('\n').filter(Boolean)
}

const specs = lsFiles('"tests/e2e/**/*.ts"')
  .map((datei) => ({ datei, inhalt: lies(datei) }))
  .filter((s) => s.inhalt !== null)

// ALLE Workflows, nicht nur ci.yml: ein Schalter darf auch in einem separaten
// Cron-/Dispatch-Workflow gesetzt sein — dann ist der Waechter nicht stumm.
const workflowInhalte = lsFiles('".github/workflows/*.yml" ".github/workflows/*.yaml"')
  .map(lies)
  .filter((i) => i !== null)

const skriptDateien = lsFiles('"scripts/check-*.mjs"')
const npmScripts = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).scripts ?? {}

const schalterTreffer = scanne(specs, workflowInhalte)
const skriptTreffer = skripteOhneAufrufer(skriptDateien, npmScripts, workflowInhalte, SKRIPT_ALLOWLIST)
const treffer = [...schalterTreffer, ...skriptTreffer]

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    count: treffer.length,
    eintraege: treffer.map(schluessel),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[stumme-waechter] Baseline aktualisiert: ${treffer.length} Eintraege (${schalterTreffer.length} Schalter, ${skriptTreffer.length} Skripte ohne Aufrufer) -> ${BASELINE_PATH}`,
  )
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
    const neueSchalter = neu.filter((k) => !k.endsWith(`::${KEIN_AUFRUFER}`))
    const neueSkripte = neu.filter((k) => k.endsWith(`::${KEIN_AUFRUFER}`))
    if (neueSchalter.length) {
      console.error(`[stumme-waechter] ${neueSchalter.length} NEUE(R) stumme(r) Waechter — der Test laeuft nirgends und meldet sich als \`skipped\`, nicht als \`failed\`:`)
      for (const k of neueSchalter) console.error(`  + ${k}`)
      console.error('Fix: den Schalter in die `env:` des passenden Workflow-Jobs aufnehmen — ABER VORHER pruefen, ob der Test damit ueberhaupt gruen laeuft (er braucht evtl. weitere Secrets/Fixtures). Bewusst manuell -> `// stumme-waechter-skip: <grund>`.')
    }
    if (neueSkripte.length) {
      console.error(`[stumme-waechter] ${neueSkripte.length} NEUE(S) Pruefskript(e) OHNE AUFRUFER — kein Workflow ruft es per npm-Key oder Dateiname auf, es laeuft nie:`)
      for (const k of neueSkripte) console.error(`  + ${k.replace(`::${KEIN_AUFRUFER}`, '')}`)
      console.error('Fix: Step `npm run check:<name> -- --ratchet` in .github/workflows/ci.yml eintragen (npm-Key in package.json anlegen). Bewusst manuelles Werkzeug -> SKRIPT_ALLOWLIST in scripts/check-stumme-waechter.mjs mit Grund.')
    }
    process.exit(1)
  }
  const behoben = (baseline.eintraege ?? []).length - treffer.length
  if (behoben > 0) {
    console.log(`[stumme-waechter] ${behoben} Eintrag/Eintraege behoben — Baseline kann gesenkt werden: \`npm run check:stumme-waechter -- --update-baseline\``)
  }
  console.log(
    `[stumme-waechter] OK — ${schalterTreffer.length} bekannte stumme Schalter + ${skriptTreffer.length} bekannte Skripte ohne Aufrufer (Baseline ${baseline.count}), 0 neue. Geprueft: ${specs.length} Specs, ${skriptDateien.length} Skripte, ${workflowInhalte.length} Workflows.`,
  )
  process.exit(0)
}

// warn (default)
if (schalterTreffer.length > 0) {
  console.log(`[stumme-waechter] ${schalterTreffer.length} ENV-gegatete Spec(s) ohne gesetzten Schalter:`)
  for (const t of schalterTreffer) console.log(`  ${t.datei}  ->  ${t.schalter}`)
}
if (skriptTreffer.length > 0) {
  console.log(`[stumme-waechter] ${skriptTreffer.length} Pruefskript(e) ohne Aufrufer (kein Workflow ruft npm-Key oder Dateiname):`)
  for (const t of skriptTreffer) console.log(`  ${t.datei}`)
}
console.log(
  `[stumme-waechter] ${schalterTreffer.length} stumme Schalter, ${skriptTreffer.length} Skripte ohne Aufrufer (${specs.length} Specs, ${skriptDateien.length} Skripte, ${workflowInhalte.length} Workflows geprueft). Policy: AGENTS.md §Stumme-Waechter-Gate`,
)
process.exit(0)
