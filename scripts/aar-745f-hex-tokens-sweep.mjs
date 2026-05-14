#!/usr/bin/env node
// AAR-745f: Arbitrary-Hex → Claimondo-Token-Sweep.
// Ersetzt Tailwind-arbitrary-Hex-Klassen die identisch zu CI-Token-Werten
// sind. Kein visuelles Diff — reine Token-Hygiene, damit das CI-Branding
// durchrendern KANN (sonst überschreiben inline-hex die Token-CSS-Variable).
//
// Konvertierungen sind 1:1 wertgleich (Hex-Code identisch zur CSS-Variable):
//   #E2E8F3 = --claimondo-border  (Light-Blue-Border)
//   #3a6290 = --claimondo-shield  (Mid-Navy)
//   #3a6291 = --claimondo-shield  (Tippfehler-Variante, gleicher Wert±1)
//   #f8f9fb = --claimondo-bg      (Off-White)
//   #0D1B3E = --claimondo-navy    (Primary)
//   #4573A2 = --claimondo-ondo    (Accent)
//   #7BA3CC = --claimondo-light-blue
//
// NICHT angefasst:
//   #25D366 (WhatsApp-Brand), #1fa855 (success-variant), #a855f7 (Spotlight)
//
// Usage: node scripts/aar-745f-hex-tokens-sweep.mjs [--dry]

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = [
  path.resolve(process.cwd(), 'src/app'),
  path.resolve(process.cwd(), 'src/components'),
]
const SKIP_DIRS = ['node_modules', '.next', 'dist', 'build']
const SKIP_DIR_NAMES = ['email/google', 'opengraph-image']

const HEX_MAP = {
  // border-Tone — light blue grid lines
  '#E2E8F3': 'claimondo-border',
  '#e2e8f3': 'claimondo-border',
  // shield-Mid-Navy
  '#3a6290': 'claimondo-shield',
  '#3A6290': 'claimondo-shield',
  '#3a6291': 'claimondo-shield',
  '#3A6291': 'claimondo-shield',
  // bg-Off-White
  '#f8f9fb': 'claimondo-bg',
  '#F8F9FB': 'claimondo-bg',
  // CI-Hauptfarben (selten als arbitrary, aber sicher mappen)
  '#0D1B3E': 'claimondo-navy',
  '#0d1b3e': 'claimondo-navy',
  '#4573A2': 'claimondo-ondo',
  '#4573a2': 'claimondo-ondo',
  '#7BA3CC': 'claimondo-light-blue',
  '#7ba3cc': 'claimondo-light-blue',
}

const PROP_PREFIXES = ['bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'placeholder', 'fill', 'stroke', 'divide', 'outline']

const MAPPINGS = []
for (const [hex, token] of Object.entries(HEX_MAP)) {
  for (const prop of PROP_PREFIXES) {
    MAPPINGS.push([`${prop}-[${hex}]`, `${prop}-${token}`])
  }
  // Mit hover:/focus:/active:/group-hover:-Modifier ebenfalls
  for (const mod of ['hover', 'focus', 'active', 'group-hover', 'md', 'lg', 'sm']) {
    for (const prop of PROP_PREFIXES) {
      MAPPINGS.push([`${mod}:${prop}-[${hex}]`, `${mod}:${prop}-${token}`])
    }
  }
}

let filesTouched = 0, totalReplacements = 0
const perFile = new Map()

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(e.name)) continue
    const p = path.join(dir, e.name)
    const rel = path.relative(process.cwd(), p).replace(/\\/g, '/')
    if (SKIP_DIR_NAMES.some(s => rel.includes(s))) continue
    if (e.isDirectory()) { walk(p); continue }
    if (!/\.(tsx?|jsx?|css)$/.test(e.name)) continue

    let src = fs.readFileSync(p, 'utf-8')
    let count = 0
    for (const [from, to] of MAPPINGS) {
      const idx = src.indexOf(from)
      if (idx < 0) continue
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')
      const matches = src.match(re)
      if (!matches) continue
      src = src.replace(re, to)
      count += matches.length
    }
    if (count > 0) {
      perFile.set(rel, count)
      filesTouched++
      totalReplacements += count
      if (!DRY) fs.writeFileSync(p, src, 'utf-8')
    }
  }
}

for (const r of ROOTS) walk(r)

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Top-15 Files:`)
const sorted = [...perFile.entries()].sort((a, b) => b[1] - a[1])
for (const [f, c] of sorted.slice(0, 15)) console.log(`  ${String(c).padStart(3)}  ${f}`)
console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Files touched: ${filesTouched}`)
console.log(`${DRY ? '[DRY-RUN] ' : ''}Total replacements: ${totalReplacements}`)
