#!/usr/bin/env node
// FG1-Ratchet (check:operative-status-writes). Blockt NEUE direkte Writes auf
// claims.operative_status ausserhalb der State-Machine-Engine.
//
// Warum: ein `.from('claims').update({ operative_status: ... })` umgeht transitionFallStatus
// -> KEIN fall.status_changed-Event, KEINE Timeline, KEINE phase_transitions. Genau diese
// Klasse erzeugte den Werkstatt-Reparatur-Abschluss-Bypass (17.07.): der Abschluss war fuer
// KB/Admin/Flottenmanager unsichtbar (Marker coordination-an-status-achsen-lane-werkstatt-
// abschluss-bypass). Der Funnel (reparatur-cursor.ts / transitionFallStatus) ist der
// Single-Writer; dieser Ratchet haelt die Klasse dauerhaft zu.
//
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Fixes)
//
// Pure Logik: scripts/lib/operative-status-write-scan.mjs (unit-getestet).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/operative-status-write-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'operative-status-writes-baseline.json')

// ── Allowlist: sanktionierte, absichtliche operative_status-Direkt-Writer ────────────────
// Diese Files DUERFEN operative_status direkt schreiben (per Design) — nie geflaggt:
//   - state-machine.ts   = DIE Engine (transitionFallStatus ist der kanonische Writer)
//   - endzustand-actions.ts = dokumentierte Cursor-Ausnahme (die 2 NICHT-terminalen Endzustand-
//     Outcomes sind CURSOR-Werte, die die Engine liest — state-machine.ts:52-66).
const ALLOWLIST = new Set([
  'src/lib/faelle/state-machine.ts',
  'src/lib/claims/endzustand-actions.ts',
])

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.endsWith('.test.ts') &&
      !f.endsWith('.test.tsx') &&
      !f.includes('/__tests__/') &&
      f !== 'src/lib/supabase/database.types.ts' &&
      !ALLOWLIST.has(f),
  )

const violating = []
const hitsByFile = new Map()
for (const f of files) {
  const hits = scanContent(readFileSync(f, 'utf8'))
  if (hits.length > 0) {
    violating.push(f)
    hitsByFile.set(f, hits)
    if (mode === 'warn') {
      for (const h of hits) {
        console.warn(`[op-status-write] ${f}:${h.line} direkter claims.operative_status-Write (${h.form}) — umgeht transitionFallStatus`)
      }
    }
  }
}
violating.sort()

if (mode === 'update') {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: violating.length, files: violating }, null, 2) + '\n',
  )
  console.log(`[op-status-write] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[op-status-write] FEHLER: keine Baseline. Erst `npm run check:operative-status-writes -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[op-status-write] ${added.length} NEUE Datei(en) mit direktem claims.operative_status-Write (umgeht die State-Machine -> kein Event/Timeline/phase_transitions):`)
    for (const f of added) {
      for (const h of hitsByFile.get(f) ?? []) console.error(`  + ${f}:${h.line} (${h.form})`)
    }
    console.error('Fix: den Uebergang durch transitionFallStatus(fallId, ...) fuehren (bzw. den reparatur-cursor.ts-Helper). Legitime Cursor-Ausnahme? -> ALLOWLIST in check-operative-status-writes.mjs mit Begruendung, NICHT die Baseline aufblaehen.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[op-status-write] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:operative-status-writes -- --update-baseline\``)
  }
  console.log(`[op-status-write] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[op-status-write] ${violating.length} Datei(en) mit direktem claims.operative_status-Write (${files.length} geprueft). --ratchet gatet neue.`)
process.exit(0)
