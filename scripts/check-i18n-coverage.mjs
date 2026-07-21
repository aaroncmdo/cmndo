#!/usr/bin/env node
// i18n-Coverage-Gate (check:i18n-coverage). Blockt NEUE dynamisch adressierte i18n-Keys,
// die in den Messages fehlen.
//
// Die Luecke, die dieses Gate schliesst: der Code baut Keys zur LAUFZEIT aus einer TS-Union
// (z.B. subphase-visibility.ts: `${'subKunde'|'subIntern'}.${lifecycle.subPhase}`). Fehlt ein
// Union-Wert in den Messages, wirft next-intl MISSING_MESSAGE und die UI rendert den ROHEN KEY.
//   - check:i18n faengt das NICHT: es prueft nur die Paritaet ZWISCHEN Locales. Fehlt ein Key
//     in ALLEN 6, ist die Paritaet erfuellt -> gruen.
//   - check:i18n-render kompiliert nur DEFINIERTE Messages, kennt keine Code-Referenzen.
// Prod-Beleg 19.07.: `MISSING_MESSAGE: phasen.subIntern.reparatur_terminfindung (de)` — die
// Fallakte zeigte woertlich den Key. Derselbe Scan fand zusaetzlich filmcheck, qc-pruefung,
// anschlussschreiben, nachbesichtigung-laeuft (haeufige Zustaende).
//
// Geprueft wird die QUELL-Locale de.json; die uebrigen 5 deckt check:i18n (Paritaet) ab.
//
// Modi:
//   (default)  --warn            : listet Luecken, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 bei NEUEN Luecken ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt die Baseline auf den aktuellen Stand
//
// NEUE dynamische Namespace-Familie? -> hier in COVERAGE eintragen (messagePath + Union-Quelle).
// Pure Logik: scripts/lib/i18n-coverage-scan.mjs (unit-getestet).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractUnionValues, findMissing, diffBaseline } from './lib/i18n-coverage-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'i18n-coverage-baseline.json')
const DE = join(ROOT, 'src/i18n/messages/de.json')

// messagePath = Punkt-Pfad in de.json; type = TS-Union, aus der der Key dynamisch gebaut wird.
const COVERAGE = [
  { messagePath: 'phasen.main', file: 'src/lib/claims/lifecycle.ts', type: 'ClaimMainPhase' },
  { messagePath: 'phasen.subIntern', file: 'src/lib/claims/lifecycle.ts', type: 'ClaimSubPhase' },
  { messagePath: 'phasen.subKunde', file: 'src/lib/claims/lifecycle.ts', type: 'ClaimSubPhase' },
]

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const messages = JSON.parse(readFileSync(DE, 'utf8'))
const violating = []
const hardErrors = []

for (const entry of COVERAGE) {
  const src = readFileSync(join(ROOT, entry.file), 'utf8')
  const values = extractUnionValues(src, entry.type)
  if (!values) {
    hardErrors.push(`Union ${entry.type} in ${entry.file} nicht gefunden (umbenannt? -> COVERAGE anpassen)`)
    continue
  }
  const { error, missing } = findMissing(values, messages, entry.messagePath)
  if (error) {
    hardErrors.push(`${error} (COVERAGE-Eintrag ${entry.messagePath})`)
    continue
  }
  for (const v of missing) violating.push(`${entry.messagePath}.${v}`)
  if (mode === 'warn' && missing.length > 0) {
    console.warn(`[i18n-coverage] ${entry.messagePath}: ${missing.length} Wert(e) ohne Label -> ${missing.join(', ')}`)
  }
}
violating.sort()

// Ein fehlender Namespace / umbenannte Union ist IMMER hart — sonst wird das Gate blind.
if (hardErrors.length > 0) {
  for (const e of hardErrors) console.error(`[i18n-coverage] KONFIG-FEHLER: ${e}`)
  process.exit(1)
}

if (mode === 'update') {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: violating.length, keys: violating }, null, 2) + '\n',
  )
  console.log(`[i18n-coverage] Baseline aktualisiert: ${violating.length} Luecken -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : { count: 0, keys: [] }
  const { added, removed } = diffBaseline(violating, baseline.keys ?? [])
  if (added.length > 0) {
    console.error(`[i18n-coverage] ${added.length} NEUE i18n-Luecke(n) — next-intl wirft zur Laufzeit MISSING_MESSAGE und die UI zeigt den ROHEN KEY:`)
    for (const k of added) console.error(`  + ${k}`)
    console.error('Fix: Label in src/i18n/messages/de.json ergaenzen (+ alle 5 weiteren Locales, sonst kippt check:i18n).')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[i18n-coverage] ${removed.length} Luecke(n) geschlossen — Baseline senken: \`npm run check:i18n-coverage -- --update-baseline\``)
  }
  console.log(`[i18n-coverage] OK — ${violating.length} bekannte Luecken (Baseline ${baseline.count ?? 0}), 0 neue.`)
  process.exit(0)
}

console.log(`[i18n-coverage] ${violating.length} Luecke(n) in ${COVERAGE.length} dynamischen Namespaces. --ratchet gatet neue.`)
process.exit(0)
