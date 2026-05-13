#!/usr/bin/env node
// AAR-745e: Erweiterte Token-Sweep für Tailwind-Default-Farben außerhalb des
// 745b/c-Mappings. Erfasst alle Shades (50/100/200/300/400/500/600/700/800/900)
// von violet/purple/indigo/slate/zinc/blue/sky/cyan und mapped rose → red.
//
// Hintergrund: 745b mappt nur einzelne Shades pro Farbe (500/600) — die
// Hauptmasse der Verstöße sitzt aber in 50/100/200 (Backgrounds) und 700/900
// (Headlines). Dieses Script schließt die Lücke.
//
// Skip-Liste enthält Files mit bewusst-nicht-CI-Farben (Status-Color-Maps,
// Spotlight-Animation, Wetter-Widget) — die brauchen Aaron-Decision.
//
// Usage:
//   node scripts/aar-745e-extended-tokens-sweep.mjs --dry   # Vorschau
//   node scripts/aar-745e-extended-tokens-sweep.mjs         # Anwenden

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOTS = [
  path.resolve(process.cwd(), 'src/app'),
  path.resolve(process.cwd(), 'src/components'),
]
const SKIP_FILES = new Set([
  'GlassPanel.tsx',
  'statusLabels.ts',          // Status-Color-Map, Aaron-Decision
  'KanbanBoard.tsx',          // Phase-Color-Code (admin/tasks)
  'leadPhaseConstants.ts',    // Lead-Phase-Color-Code
  'Spotlight.tsx',            // Animation-Glow
  'WeatherWidget.tsx',        // Wetter-Semantik
  'GespraechsleitfadenTimer.tsx', // Timer-Phase-Code
])
const SKIP_DIRS = ['node_modules', '.next', 'dist', 'build']

const MAPPINGS = []

// ─── violet/purple → claimondo-ondo (Premium-Akzent) ────────────────────────
for (const c of ['violet', 'purple']) {
  MAPPINGS.push(
    // Backgrounds
    [`bg-${c}-50`, 'bg-claimondo-ondo/[0.06]'],
    [`bg-${c}-100`, 'bg-claimondo-ondo/[0.10]'],
    [`bg-${c}-200`, 'bg-claimondo-ondo/20'],
    [`bg-${c}-300`, 'bg-claimondo-ondo/40'],
    [`bg-${c}-400`, 'bg-claimondo-ondo/60'],
    [`bg-${c}-500`, 'bg-claimondo-ondo'],
    [`bg-${c}-600`, 'bg-claimondo-ondo'],
    [`bg-${c}-700`, 'bg-claimondo-navy'],
    [`bg-${c}-800`, 'bg-claimondo-navy'],
    [`bg-${c}-900`, 'bg-claimondo-navy'],
    // Text
    [`text-${c}-300`, 'text-claimondo-ondo/70'],
    [`text-${c}-400`, 'text-claimondo-ondo'],
    [`text-${c}-500`, 'text-claimondo-ondo'],
    [`text-${c}-600`, 'text-claimondo-ondo'],
    [`text-${c}-700`, 'text-claimondo-navy'],
    [`text-${c}-800`, 'text-claimondo-navy'],
    [`text-${c}-900`, 'text-claimondo-navy'],
    // Border / Ring
    [`border-${c}-100`, 'border-claimondo-ondo/20'],
    [`border-${c}-200`, 'border-claimondo-ondo/30'],
    [`border-${c}-300`, 'border-claimondo-ondo/50'],
    [`border-${c}-400`, 'border-claimondo-ondo/60'],
    [`border-${c}-500`, 'border-claimondo-ondo'],
    [`border-${c}-600`, 'border-claimondo-ondo'],
    [`ring-${c}-500`, 'ring-claimondo-ondo'],
    [`ring-${c}-600`, 'ring-claimondo-ondo'],
  )
}

// ─── rose → red (semantic danger, 1:1) ──────────────────────────────────────
for (const sh of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
  MAPPINGS.push(
    [`bg-rose-${sh}`, `bg-red-${sh}`],
    [`text-rose-${sh}`, `text-red-${sh}`],
    [`border-rose-${sh}`, `border-red-${sh}`],
    [`ring-rose-${sh}`, `ring-red-${sh}`],
    [`hover:bg-rose-${sh}`, `hover:bg-red-${sh}`],
    [`hover:text-rose-${sh}`, `hover:text-red-${sh}`],
    [`focus:bg-rose-${sh}`, `focus:bg-red-${sh}`],
  )
}

// ─── indigo → claimondo-navy ────────────────────────────────────────────────
MAPPINGS.push(
  ['bg-indigo-50', 'bg-claimondo-navy/[0.06]'],
  ['bg-indigo-100', 'bg-claimondo-navy/[0.10]'],
  ['bg-indigo-200', 'bg-claimondo-navy/20'],
  ['bg-indigo-700', 'bg-claimondo-navy'],
  ['bg-indigo-800', 'bg-claimondo-navy'],
  ['bg-indigo-900', 'bg-claimondo-navy'],
  ['text-indigo-700', 'text-claimondo-navy'],
  ['text-indigo-800', 'text-claimondo-navy'],
  ['border-indigo-200', 'border-claimondo-navy/20'],
  ['border-indigo-300', 'border-claimondo-navy/30'],
)

// ─── slate/zinc-Reste (745b-Lücken) ─────────────────────────────────────────
for (const c of ['slate', 'zinc']) {
  MAPPINGS.push(
    [`bg-${c}-300`, 'bg-claimondo-border'],
    [`bg-${c}-400`, 'bg-claimondo-light-blue'],
    [`text-${c}-300`, 'text-claimondo-light-blue'],
    [`placeholder-${c}-500`, 'placeholder-claimondo-shield'],
    [`focus:border-${c}-500`, 'focus:border-claimondo-ondo'],
    [`focus:ring-${c}-700`, 'focus:ring-claimondo-ondo'],
  )
}

// ─── blue/sky/cyan-Reste (Non-Status) → claimondo-ondo ─────────────────────
for (const c of ['blue', 'sky', 'cyan']) {
  MAPPINGS.push(
    [`bg-${c}-50`, 'bg-claimondo-ondo/[0.06]'],
    [`bg-${c}-100`, 'bg-claimondo-ondo/[0.10]'],
    [`text-${c}-500`, 'text-claimondo-ondo'],
    [`text-${c}-600`, 'text-claimondo-ondo'],
    [`text-${c}-700`, 'text-claimondo-navy'],
    [`border-${c}-200`, 'border-claimondo-ondo/30'],
    [`border-${c}-300`, 'border-claimondo-ondo/40'],
    [`border-${c}-400`, 'border-claimondo-ondo/60'],
    [`border-${c}-500`, 'border-claimondo-ondo'],
  )
}

// ─── Walk & Replace ─────────────────────────────────────────────────────────
let filesTouched = 0
let totalReplacements = 0
const perFile = new Map()

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(p); continue }
    if (SKIP_FILES.has(entry.name)) continue
    if (!/\.(tsx?|jsx?|mjs|css)$/.test(entry.name)) continue

    let src = fs.readFileSync(p, 'utf-8')
    const before = src
    let fileCount = 0
    for (const [from, to] of MAPPINGS) {
      // Boundary: nicht mitten in einem längeren Wort ersetzen
      const re = new RegExp(`\\b${from.replace(/[/[\](){}.*+?^$|\\]/g, '\\$&')}\\b`, 'g')
      const matches = src.match(re)
      if (!matches) continue
      src = src.replace(re, to)
      fileCount += matches.length
    }
    if (fileCount > 0) {
      const rel = path.relative(process.cwd(), p)
      perFile.set(rel, fileCount)
      filesTouched++
      totalReplacements += fileCount
      if (!DRY) fs.writeFileSync(p, src, 'utf-8')
    }
  }
}

for (const r of ROOTS) walk(r)

const sorted = [...perFile.entries()].sort((a, b) => b[1] - a[1])
console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Top-20 Files:`)
for (const [f, c] of sorted.slice(0, 20)) console.log(`  ${String(c).padStart(4)}  ${f}`)
console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Files touched: ${filesTouched}`)
console.log(`${DRY ? '[DRY-RUN] ' : ''}Total replacements: ${totalReplacements}`)
