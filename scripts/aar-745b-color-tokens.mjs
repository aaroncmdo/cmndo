#!/usr/bin/env node
// AAR-745b: CI/CD-Farb-Harmonisierung in src/components/shared.
// Ersetzt generische Tailwind-Farben (gray/slate/zinc/neutral/stone/blue/
// indigo/violet/purple/pink/cyan/sky/teal/lime) durch Claimondo-Tokens
// (claimondo-navy, claimondo-ondo, claimondo-shield, claimondo-border,
// claimondo-light-blue). Semantic-Farben (red/rose/emerald/green/amber/
// yellow/orange) bleiben bewusst erhalten — die tragen Status-Bedeutung
// (Error, Success, Warning).
//
// Usage: node scripts/aar-745b-color-tokens.mjs [--dry]
// GlassPanel.tsx wird ausgeschlossen (iOS-Glass-Effekt nutzt Gradient mit
// white/XX — das ist kein CI/CD-Farbverstoß).

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOT = path.resolve(process.cwd(), 'src/components/shared')
const SKIP = new Set(['GlassPanel.tsx'])

/**
 * Mapping-Tabelle. Reihenfolge: spezifischere Präfixe zuerst.
 * Alle Keys matchen ohne Modifier (hover:/focus:/md: werden vom
 * einfachen String-Replace automatisch mit-ersetzt, weil nur der
 * Suffix-Teil ersetzt wird).
 */
const MAPPINGS = [
  // ─── Gray / Slate / Zinc / Neutral / Stone — Text ──────────────────
  // sehr hell: sekundärer Fließtext → ondo
  ['text-gray-300', 'text-claimondo-light-blue'],
  ['text-gray-400', 'text-claimondo-ondo/70'],
  ['text-gray-500', 'text-claimondo-ondo'],
  ['text-gray-600', 'text-claimondo-ondo'],
  // dunkler: primärer Text → navy
  ['text-gray-700', 'text-claimondo-navy'],
  ['text-gray-800', 'text-claimondo-navy'],
  ['text-gray-900', 'text-claimondo-navy'],

  ['text-slate-300', 'text-claimondo-light-blue'],
  ['text-slate-400', 'text-claimondo-ondo/70'],
  ['text-slate-500', 'text-claimondo-ondo'],
  ['text-slate-600', 'text-claimondo-ondo'],
  ['text-slate-700', 'text-claimondo-navy'],
  ['text-slate-800', 'text-claimondo-navy'],
  ['text-slate-900', 'text-claimondo-navy'],

  ['text-zinc-400', 'text-claimondo-ondo/70'],
  ['text-zinc-500', 'text-claimondo-ondo'],
  ['text-zinc-600', 'text-claimondo-ondo'],
  ['text-zinc-700', 'text-claimondo-navy'],
  ['text-zinc-800', 'text-claimondo-navy'],
  ['text-zinc-900', 'text-claimondo-navy'],

  ['text-neutral-400', 'text-claimondo-ondo/70'],
  ['text-neutral-500', 'text-claimondo-ondo'],
  ['text-neutral-600', 'text-claimondo-ondo'],
  ['text-neutral-700', 'text-claimondo-navy'],
  ['text-neutral-800', 'text-claimondo-navy'],
  ['text-neutral-900', 'text-claimondo-navy'],

  ['text-stone-500', 'text-claimondo-ondo'],
  ['text-stone-600', 'text-claimondo-ondo'],
  ['text-stone-700', 'text-claimondo-navy'],

  // ─── Gray / Slate / Zinc — Backgrounds ─────────────────────────────
  ['bg-gray-50', 'bg-[#f8f9fb]'],
  ['bg-gray-100', 'bg-[#f8f9fb]'],
  ['bg-gray-200', 'bg-claimondo-border'],
  ['bg-gray-300', 'bg-claimondo-border'],
  ['bg-gray-400', 'bg-claimondo-light-blue'],
  ['bg-gray-700', 'bg-claimondo-navy'],
  ['bg-gray-800', 'bg-claimondo-navy'],
  ['bg-gray-900', 'bg-claimondo-navy'],

  ['bg-slate-50', 'bg-[#f8f9fb]'],
  ['bg-slate-100', 'bg-[#f8f9fb]'],
  ['bg-slate-200', 'bg-claimondo-border'],
  ['bg-slate-700', 'bg-claimondo-navy'],
  ['bg-slate-800', 'bg-claimondo-navy'],
  ['bg-slate-900', 'bg-claimondo-navy'],

  ['bg-zinc-50', 'bg-[#f8f9fb]'],
  ['bg-zinc-100', 'bg-[#f8f9fb]'],
  ['bg-zinc-200', 'bg-claimondo-border'],

  ['bg-neutral-50', 'bg-[#f8f9fb]'],
  ['bg-neutral-100', 'bg-[#f8f9fb]'],
  ['bg-neutral-200', 'bg-claimondo-border'],

  // ─── Border / Ring / Divide ────────────────────────────────────────
  ['border-gray-100', 'border-claimondo-border'],
  ['border-gray-200', 'border-claimondo-border'],
  ['border-gray-300', 'border-claimondo-border'],
  ['border-gray-400', 'border-claimondo-ondo/40'],
  ['border-gray-500', 'border-claimondo-ondo'],

  ['border-slate-100', 'border-claimondo-border'],
  ['border-slate-200', 'border-claimondo-border'],
  ['border-slate-300', 'border-claimondo-border'],

  ['border-zinc-200', 'border-claimondo-border'],
  ['border-neutral-200', 'border-claimondo-border'],

  ['ring-gray-200', 'ring-claimondo-border'],
  ['ring-gray-300', 'ring-claimondo-border'],

  ['divide-gray-100', 'divide-claimondo-border'],
  ['divide-gray-200', 'divide-claimondo-border'],
  ['divide-slate-200', 'divide-claimondo-border'],

  ['placeholder-gray-300', 'placeholder-claimondo-ondo/50'],
  ['placeholder-gray-400', 'placeholder-claimondo-ondo/60'],
  ['placeholder-gray-500', 'placeholder-claimondo-ondo'],

  // ─── Blue (Tailwind-Default) → Claimondo Ondo / Navy ───────────────
  ['text-blue-50', 'text-claimondo-light-blue'],
  ['text-blue-100', 'text-claimondo-light-blue'],
  ['text-blue-500', 'text-claimondo-ondo'],
  ['text-blue-600', 'text-claimondo-ondo'],
  ['text-blue-700', 'text-claimondo-navy'],
  ['text-blue-800', 'text-claimondo-navy'],
  ['text-blue-900', 'text-claimondo-navy'],

  ['bg-blue-50', 'bg-claimondo-ondo/10'],
  ['bg-blue-100', 'bg-claimondo-ondo/20'],
  ['bg-blue-500', 'bg-claimondo-ondo'],
  ['bg-blue-600', 'bg-claimondo-ondo'],
  ['bg-blue-700', 'bg-claimondo-navy'],
  ['bg-blue-800', 'bg-claimondo-navy'],
  ['bg-blue-900', 'bg-claimondo-navy'],

  ['border-blue-100', 'border-claimondo-border'],
  ['border-blue-200', 'border-claimondo-ondo/30'],
  ['border-blue-500', 'border-claimondo-ondo'],
  ['border-blue-600', 'border-claimondo-ondo'],
  ['border-blue-700', 'border-claimondo-navy'],

  ['ring-blue-500', 'ring-claimondo-ondo'],
  ['ring-blue-600', 'ring-claimondo-ondo'],

  // ─── Sky / Cyan / Teal → Ondo ──────────────────────────────────────
  ['bg-sky-500', 'bg-claimondo-ondo'],
  ['bg-sky-600', 'bg-claimondo-ondo'],
  ['text-sky-500', 'text-claimondo-ondo'],
  ['text-sky-600', 'text-claimondo-ondo'],

  ['bg-cyan-500', 'bg-claimondo-ondo'],
  ['bg-cyan-600', 'bg-claimondo-ondo'],
  ['text-cyan-500', 'text-claimondo-ondo'],
  ['text-cyan-600', 'text-claimondo-ondo'],

  // ─── Indigo / Violet / Purple → Navy ───────────────────────────────
  ['bg-indigo-500', 'bg-claimondo-navy'],
  ['bg-indigo-600', 'bg-claimondo-navy'],
  ['text-indigo-500', 'text-claimondo-navy'],
  ['text-indigo-600', 'text-claimondo-navy'],

  ['bg-violet-500', 'bg-claimondo-navy'],
  ['bg-violet-600', 'bg-claimondo-navy'],
  ['text-violet-500', 'text-claimondo-navy'],
  ['text-violet-600', 'text-claimondo-navy'],

  ['bg-purple-500', 'bg-claimondo-navy'],
  ['bg-purple-600', 'bg-claimondo-navy'],
  ['text-purple-500', 'text-claimondo-navy'],
  ['text-purple-600', 'text-claimondo-navy'],
]

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    if (!e.name.endsWith('.tsx') && !e.name.endsWith('.ts')) return []
    if (SKIP.has(e.name)) return []
    return [full]
  })
}

const files = walk(ROOT)
let totalReplacements = 0
const touchedFiles = []

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8')
  let content = original
  let fileReplacements = 0
  const hits = {}
  for (const [from, to] of MAPPINGS) {
    // Word-boundary rechts: Token darf nicht Teil eines längeren Tokens sein.
    // text-blue-500 darf nicht in text-blue-500/50 ersetzen (anderes Token).
    // Regex: exaktes Token gefolgt von ASCII-space/quote/bracket/newline/slash.
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}(?=[\\s"'\`\\]\\)/]|$)`, 'g')
    const matches = content.match(re)
    if (matches) {
      content = content.replace(re, to)
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
for (const t of touchedFiles) {
  console.log(`  ${t.file} (${t.count})`)
  for (const [from, n] of Object.entries(t.hits)) {
    console.log(`      ${from.padEnd(26)} × ${n}`)
  }
}
