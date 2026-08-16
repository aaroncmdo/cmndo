#!/usr/bin/env node
// Intake-Funnel-Ratchet (check:intake-funnel). Blockt NEUE direkte `createLead(...)`-
// Aufrufe ausserhalb des Intake-Moduls.
//
// Warum: `createCase` (src/lib/intake/create-case.ts) ist DER Eintrittspunkt fuer jede
// Meldung — er garantiert neben dem Lead auch den FlowLink (C2 §7#1, DECISIONS
// 2026-08-04). Ein roher `createLead`-Aufruf erzeugt einen Interessenten OHNE jeden
// Kunde-Kanal: bleibt die Rueckmeldung aus, hat er keinen Weg zurueck in seinen Vorgang.
// Genau das war beim Aircall-Webhook (C2b D-4b), beim matelso-Webhook (#5292) und beim
// oeffentlichen Rueckruf (#5308) der Fall — dort gemessen: 2 von 2 Rueckruf-Leads ohne
// FlowLink, also 100 % der Klasse.
//
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Fixes)
//
// Pure Logik: scripts/lib/intake-funnel-scan.mjs (unit-getestet, 16 Faelle).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline } from './lib/intake-funnel-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'intake-funnel-baseline.json')

// ── Allowlist: Files, die createLead per Design direkt aufrufen duerfen ──────────────
const ALLOWLIST = new Set([
  // DER Funnel selbst — createCase ruft createLead intern auf. Das IST der Zielpfad.
  'src/lib/intake/create-case.ts',
  // Die Definition.
  'src/lib/leads/create-lead.ts',
  // Erzeugt SELBST kanonische FlowLinks. Ueber createCase zu gehen waere zirkulaer
  // (createCase ruft ensureCanonicalFlowLinkForLead, das hier lebt).
  'src/lib/start-link/issue-canonical-flowlink.ts',
  // NFC-Schadenkarte = GEGNER-Flow, nicht Kunde. Ein Flottenfahrzeug wird beschaedigt,
  // der VERURSACHER tappt die Karte und traegt sich ein: die Daten landen in `gegner_*`,
  // `schuldfrage='gegner'`, Geschaedigter ist die Flotten-Firma (gewerbe_flag + firma_name).
  // Ein FlowLink wuerde dem Gegner einen Kunde-Kanal in den Vorgang des Geschaedigten geben
  // — fachlich falsch. Die 4 von 6 Leads ohne FlowLink (Messung 16.08.) sind hier KORREKT.
  // Deshalb Allowlist statt Baseline: sonst liest die naechste Session das als Schuld und
  // migriert es „weg" (beim Aufraeumen 16.08. beinahe passiert).
  'src/app/schaden/[token]/actions.ts',
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
        console.warn(`[intake-funnel] ${f}:${h.line} direkter createLead-Aufruf — Lead ohne garantierten FlowLink`)
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
  console.log(`[intake-funnel] Baseline aktualisiert: ${violating.length} Files -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[intake-funnel] FEHLER: keine Baseline. Erst `npm run check:intake-funnel -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violating, baseline.files ?? [])
  if (added.length > 0) {
    console.error(`[intake-funnel] ${added.length} NEUE Datei(en) mit direktem createLead-Aufruf (Lead ohne garantierten FlowLink = Interessent ohne Rueckweg):`)
    for (const f of added) {
      for (const h of hitsByFile.get(f) ?? []) console.error(`  + ${f}:${h.line}`)
    }
    console.error(
      'Fix: ueber `createCase(client, { mode: "lead-first" | "direct-claim", base, extra })` gehen\n' +
        '     (src/lib/intake/create-case.ts). base/extra bleiben unveraendert — createCase ruft\n' +
        '     intern dasselbe createLead und ergaenzt nur den FlowLink.\n' +
        '     ⚠ Unit-Test der Call-Site: `createCase` MOCKEN (create-case.ts importiert\n' +
        '       \'server-only\', das in vitest schon beim Import wirft).\n' +
        '     Echter Sonderfall (erzeugt selbst FlowLinks o.ae.)? -> ALLOWLIST in\n' +
        '     check-intake-funnel.mjs mit Begruendung, NICHT die Baseline aufblaehen.',
    )
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[intake-funnel] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:intake-funnel -- --update-baseline\``)
  }
  console.log(`[intake-funnel] OK — ${violating.length} bekannte Verletzer (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[intake-funnel] ${violating.length} Datei(en) mit direktem createLead-Aufruf (${files.length} geprueft). --ratchet gatet neue.`)
process.exit(0)
