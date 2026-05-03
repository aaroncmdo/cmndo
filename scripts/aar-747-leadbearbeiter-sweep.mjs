#!/usr/bin/env node
// AAR-747 Code-Sweep: leadbearbeiter-Referenzen → dispatch.
// Ersetzt:
//   - leadbearbeiter_id → dispatch_id (DB-Column/FK-Name)
//   - leadbearbeiterId  → dispatchId  (camelCase)
//   - 'leadbearbeiter'  → 'dispatch'  (Rollen-Literal)
//   - "leadbearbeiter"  → "dispatch"
//   - Lead-Bearbeiter   → Dispatcher  (UI-Label mit Bindestrich)
//   - Leadbearbeiter    → Dispatcher  (UI-Label / Title-Case)
//   - leadbearbeiter    → dispatch    (letzte Fallback-Variante, lowercase im Text)
//
// Ausgeschlossen:
//   - src/lib/supabase/database.types.ts (wird von supabase gen types neu generiert)
//
// Nach dem Lauf: Build-Check + Spot-Review, weil Array-Duplikate
// (['admin', 'dispatch', 'dispatch']) manuell dedupliziert werden müssen.

import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOT = path.resolve(process.cwd(), 'src')
const SKIP = new Set([
  path.join('src', 'lib', 'supabase', 'database.types.ts'),
])

// Reihenfolge: spezifischere Matches zuerst.
const REPLACEMENTS = [
  // DB-Columns + camelCase
  [/\bleadbearbeiter_id\b/g, 'dispatch_id'],
  [/\bleadbearbeiterId\b/g, 'dispatchId'],
  // Rollen-Literale (Quoted)
  [/'leadbearbeiter'/g, "'dispatch'"],
  [/"leadbearbeiter"/g, '"dispatch"'],
  [/`leadbearbeiter`/g, '`dispatch`'],
  // UI-Labels (häufigere Varianten zuerst)
  [/Lead-Bearbeiter/g, 'Dispatcher'],
  [/Leadbearbeiter/g, 'Dispatcher'],
  // Letzter Fallback: bare lowercase in Kommentaren/Tests/Labels.
  // Matcht NICHT wenn Buchstabe davor/danach (word-boundary).
  [/\bleadbearbeiter\b/g, 'dispatch'],
]

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const files = walk(ROOT)
let totalReplacements = 0
const touched = []

for (const file of files) {
  const rel = path.relative(process.cwd(), file)
  if (SKIP.has(rel)) continue
  const original = fs.readFileSync(file, 'utf8')
  if (!/leadbearbeiter|Leadbearbeiter|Lead-Bearbeiter/.test(original)) continue

  let content = original
  let count = 0
  for (const [pattern, replacement] of REPLACEMENTS) {
    const matches = content.match(pattern)
    if (matches) {
      content = content.replace(pattern, replacement)
      count += matches.length
    }
  }

  if (count > 0 && content !== original) {
    touched.push({ file: rel, count })
    totalReplacements += count
    if (!DRY) fs.writeFileSync(file, content, 'utf8')
  }
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Files touched: ${touched.length}`)
console.log(`${DRY ? '[DRY-RUN] ' : ''}Total replacements: ${totalReplacements}\n`)
for (const t of touched) console.log(`  ${t.file} × ${t.count}`)
