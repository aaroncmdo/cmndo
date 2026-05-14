#!/usr/bin/env node
// AAR-745d: Sweep für hardcoded Inline-Shadows + Radien.
//
// Voraussetzung: globals.css hat die neuen Tokens (shadow-claimondo-*,
// rounded-claimondo-*, shadow-focus-ondo, shadow-cta-ondo[-hover],
// shadow-sheet, shadow-glass-card, shadow-glass-pill).
//
// Mappings stammen aus der empirischen Häufigkeits-Analyse vom 13.05.2026
// (DESIGN-TOKEN-FIX-PLAN.md). Skript überschreibt nur exakte String-Matches —
// Varianten mit anderen rgba-Alpha-Werten bleiben unangetastet.
//
// Usage:
//   node scripts/aar-745d-shadow-radius-sweep.mjs --dry
//   node scripts/aar-745d-shadow-radius-sweep.mjs

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = [
  path.resolve(process.cwd(), 'src/app'),
  path.resolve(process.cwd(), 'src/components'),
]
const SKIP_FILES = new Set(['GlassPanel.tsx'])
const SKIP_DIRS = ['src/components/ui']

/** Mappings: exakter Inline-String → Token-Klasse. */
const MAPPINGS = [
  // ─── Shadow (Top-Pattern aus Frequenz-Analyse) ──────────────────────
  // 15x — Sheet/Modal-Container
  [
    'shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)]',
    'shadow-sheet',
  ],
  // 31x — Card/Panel (Approximation auf claimondo-md)
  [
    'shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)]',
    'shadow-claimondo-md',
  ],
  // 24x — Focus-Ring auf Liquid-Glass-Input
  ['shadow-[0_0_0_4px_rgba(69,115,162,.12)]', 'shadow-focus-ondo'],
  // 20x — Ondo-Button-Standard
  [
    'shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)]',
    'shadow-cta-ondo',
  ],
  // 13x — Marketing-Glass-Card
  ['shadow-[0_4px_20px_rgba(13,27,62,0.06)]', 'shadow-glass-card'],
  // 10x — Ondo-CTA-Button-Light-Variante
  ['shadow-[0_8px_28px_rgba(69,115,162,0.45)]', 'shadow-cta-ondo'],
  // 9x — Marketing-Pill (Eyebrow / kleine Badges)
  ['shadow-[0_2px_12px_rgba(13,27,62,0.06)]', 'shadow-glass-pill'],
  // 7x — Ondo-CTA-Hover
  [
    'shadow-[0_8px_22px_rgba(69,115,162,.36),0_2px_4px_rgba(69,115,162,.20)]',
    'shadow-cta-ondo-hover',
  ],
  // 5x — Marketing-Glass-Card Variante
  ['shadow-[0_4px_18px_rgba(13,27,62,0.06)]', 'shadow-glass-card'],
  // 4x — Marketing-Card-Hover (Approximation)
  ['shadow-[0_8px_28px_rgba(13,27,62,0.10)]', 'shadow-claimondo-lg'],
  // 3x — Approximation
  ['shadow-[0_8px_24px_rgba(13,27,62,.1)]', 'shadow-claimondo-lg'],
  // 3x — Approximation
  ['shadow-[0_4px_20px_rgba(13,27,62,0.07)]', 'shadow-glass-card'],

  // ─── Radius ─────────────────────────────────────────────────────────
  // 8x — bg-Card/Input-Radius
  ['rounded-[14px]', 'rounded-claimondo-md'],
  // 6x — Sheet/Modal-Container
  ['rounded-[36px]', 'rounded-claimondo-sheet'],
]

function isSkipped(file) {
  if (SKIP_FILES.has(path.basename(file))) return true
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/')
  return SKIP_DIRS.some((d) => rel.startsWith(d))
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    if (!e.name.endsWith('.tsx') && !e.name.endsWith('.ts')) return []
    if (isSkipped(full)) return []
    return [full]
  })
}

const files = ROOTS.flatMap(walk)
let totalReplacements = 0
const touchedFiles = []

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8')
  let content = original
  let fileReplacements = 0
  const hits = {}
  for (const [from, to] of MAPPINGS) {
    // Einfacher String-Replace: die Mappings enthalten keine Tailwind-Modifier
    // (hover:/focus:/md:) im `from` — die werden vor dem matchenden Suffix
    // ohnehin nicht ersetzt, weil split(': '). Wir bauen einen Regex der den
    // Modifier optional erlaubt und ihn in der Replacement-Klasse beibehält.
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s"'\`])((?:hover:|focus:|focus-within:|active:|md:|lg:|sm:)*)${escaped}(?=[\\s"'\`\\]\\)/]|$)`, 'g')
    const matches = content.match(re)
    if (matches) {
      content = content.replace(re, (_, pre, mod) => `${pre}${mod}${to}`)
      fileReplacements += matches.length
      hits[from] = matches.length
    }
  }
  if (fileReplacements > 0) {
    touchedFiles.push({ file: path.relative(process.cwd(), file), count: fileReplacements, hits })
    totalReplacements += fileReplacements
    if (!DRY) fs.writeFileSync(file, content, 'utf8')
  }
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Files touched: ${touchedFiles.length}`)
console.log(`${DRY ? '[DRY-RUN] ' : ''}Total replacements: ${totalReplacements}\n`)

touchedFiles.sort((a, b) => b.count - a.count)
for (const t of touchedFiles.slice(0, 25)) {
  console.log(`  ${t.file} (${t.count})`)
}
if (touchedFiles.length > 25) {
  console.log(`  ... + ${touchedFiles.length - 25} weitere Files`)
}
