#!/usr/bin/env node
// AAR-frontend-konsolidierung-p1: Drift-Bremse — warnt bei handgerollten
// Komponenten in src/app + src/components (ausgenommen ui/, primitives/,
// shared/). Nur --warn — blockt CI nicht hart (exit 0).
//
// Siehe AGENTS.md §claimondo-component-set + docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files "src/app/**/*.tsx" "src/components/**/*.tsx"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter(
    (f) =>
      !f.includes('/components/ui/') &&
      !f.includes('/components/primitives/') &&
      !f.includes('/components/shared/'),
  )

const PATTERNS = [
  {
    re: /<button\b[^>]*className=["'`][^"'`]*\b(rounded|bg-claimondo-(navy|ondo|shield))\b/,
    msg: 'handgerollter <button> mit Styling → primitives.Button',
  },
  {
    re: /<div\b[^>]*className=["'`][^"'`]*bg-white[^"'`]*rounded[^"'`]*border[^"'`]*claimondo-border/,
    msg: 'handgerollte Section-Card-<div> → primitives.Card / shared/SectionCard',
  },
  {
    re: /function\s+(StatCard|KpiCard|KpiBox|FilterChip|StatusPill|MiniDrawer|SectionCard|InfoRow|InfoCard)\b/,
    msg: 'lokale Reimplementierung eines shared-Pendants',
  },
]

let hits = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const { re, msg } of PATTERNS) {
    if (re.test(src)) {
      console.warn(`[component-set] ${f}: ${msg}`)
      hits++
      break
    }
  }
}
console.log(
  `[component-set] ${hits} Datei(en) mit Drift-Verdacht (${files.length} geprüft). Policy: AGENTS.md §claimondo-component-set`,
)
process.exit(0) // immer 0 — nur --warn
