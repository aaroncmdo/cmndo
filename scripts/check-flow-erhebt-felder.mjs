#!/usr/bin/env node
// Flow-erhebt-felder-Ratchet (check:flow-erhebt-felder, Spec 2026-07-21).
// Gatet die erhebt_felder der FlowLink-Matrix: jeder Eintrag MUSS eine echte, NICHT
// default-behaftete, NICHT abgeleitete leads-Rohspalte sein. Ein Default-Feld (z.B.
// hat_vorschaeden) gatet nie (Symptom 1), ein *_effektiv-Feld wird vom unfallort-Fallback
// maskiert (Symptom 2), ein Tippfehler gatet nie. Hard-0 (kein Grandfathering).
//
// Quelle = das Fixture (src/lib/self-service/__tests__/flow-config-fixture.ts), der committete
// Spiegel des DB-Seeds. So laeuft der Check ohne DB-Creds in CI (wie check:flag-drift).
// Snapshot der leads-Column-Defaults: scripts/lib/leads-column-defaults.json (READ-regeneriert).
//
// Modi:  (default) --warn  : listet Verletzer, exit 0
//        --ratchet         : exit 1 bei >=1 Verletzer (CI-Gate)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanErhebtFelder } from './lib/flow-erhebt-felder-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(__dirname, '..', 'src', 'lib', 'self-service', '__tests__', 'flow-config-fixture.ts')
const DEFAULTS = join(__dirname, 'lib', 'leads-column-defaults.json')

const columnDefaults = JSON.parse(readFileSync(DEFAULTS, 'utf8')).columns
const mode = process.argv.includes('--ratchet') ? 'ratchet' : 'warn'

// Aus jeder Fixture-Zeile mit erhebt_felder das (step_id, erhebt_felder) parsen.
const steps = []
for (const line of readFileSync(FIXTURE, 'utf8').split('\n')) {
  if (!line.includes('erhebt_felder:')) continue
  const stepId = (line.match(/step_id:\s*'([^']+)'/) ?? [])[1] ?? '?'
  const inner = (line.match(/erhebt_felder:\s*\[([^\]]*)\]/) ?? [])[1] ?? ''
  const felder = inner
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  steps.push({ step_id: stepId, erhebt_felder: felder })
}

const verletzer = scanErhebtFelder(steps, columnDefaults)

if (verletzer.length === 0) {
  console.log(`[flow-erhebt-felder] OK — ${steps.length} erhebt_felder-Steps, 0 Verletzer.`)
  process.exit(0)
}

for (const v of verletzer) {
  const [step, feld, grund] = v.split(':')
  const hint =
    grund === 'hat-default'
      ? 'hat DB-Default -> gatet nie (Symptom 1). Aus erhebt_felder nehmen; im Wizard trotzdem erhoben.'
      : grund === 'abgeleitet'
        ? 'abgeleitetes *_effektiv-Feld -> per Fallback maskiert (Symptom 2). Rohspalte nehmen.'
        : 'keine leads-Spalte (Tippfehler?). Snapshot: scripts/lib/leads-column-defaults.json.'
  console.error(`[flow-erhebt-felder] ${step}.erhebt_felder: '${feld}' ${hint}`)
}
console.error(`[flow-erhebt-felder] ${verletzer.length} Verletzer. Policy: docs/superpowers/specs/2026-07-21-flowlink-operative-vollstaendigkeit-design.md §2.6`)
process.exit(mode === 'ratchet' ? 1 : 0)
