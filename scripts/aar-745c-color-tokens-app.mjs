#!/usr/bin/env node
// AAR-745c: Erweitert die aar-745b-Mappings auf src/app/* + src/components/*
// (nicht nur src/components/shared). Skip-Liste für visuell-kuratierte Komponenten
// die Tailwind-Default-Farben bewusst nutzen (z. B. Marketing-Hero-Gradients).
//
// Usage:
//   node scripts/aar-745c-color-tokens-app.mjs --dry   # Vorschau
//   node scripts/aar-745c-color-tokens-app.mjs         # Ausführen
//
// Mappings sind identisch zu aar-745b. Wenn Aaron später eines erweitert,
// hier auch ergänzen ODER die Mappings in ein eigenes Modul auslagern.

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')

const ROOTS = [
  path.resolve(process.cwd(), 'src/app'),
  path.resolve(process.cwd(), 'src/components'),
]

// Skip-Liste: Dateien die bewusst Tailwind-Defaults nutzen oder kuratiert sind.
const SKIP_FILES = new Set([
  'GlassPanel.tsx',
  // Landing/Marketing: Hero-Gradients dürfen Tailwind-Farbverläufe haben.
  // Wenn Aaron einzelne Pages migrieren will, hier Eintrag entfernen.
])

// Skip-Verzeichnisse (relative zu cwd)
const SKIP_DIRS = [
  'src/components/ui', // shadcn — bleibt nahe am Upstream
]

// Identisch zu aar-745b
const MAPPINGS = [
  ['text-gray-300', 'text-claimondo-light-blue'],
  ['text-gray-400', 'text-claimondo-ondo/70'],
  ['text-gray-500', 'text-claimondo-ondo'],
  ['text-gray-600', 'text-claimondo-ondo'],
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
  ['bg-sky-500', 'bg-claimondo-ondo'],
  ['bg-sky-600', 'bg-claimondo-ondo'],
  ['text-sky-500', 'text-claimondo-ondo'],
  ['text-sky-600', 'text-claimondo-ondo'],
  ['bg-cyan-500', 'bg-claimondo-ondo'],
  ['bg-cyan-600', 'bg-claimondo-ondo'],
  ['text-cyan-500', 'text-claimondo-ondo'],
  ['text-cyan-600', 'text-claimondo-ondo'],
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

touchedFiles.sort((a, b) => b.count - a.count)
for (const t of touchedFiles.slice(0, 30)) {
  console.log(`  ${t.file} (${t.count})`)
}
if (touchedFiles.length > 30) {
  console.log(`  ... + ${touchedFiles.length - 30} weitere Files`)
}
