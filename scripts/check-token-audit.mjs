#!/usr/bin/env node
// Token-Audit-Drift-Bremse: blockt neue Hex-Verstöße gegen das Claimondo-Token-System.
//
// Findet:
//   1. Tailwind-arbitrary-Klassen mit Hex: `bg-[#xxx]`, `text-[#xxx]`, etc.
//   2. Raw inline-hex in style={{ }} ohne `var(--brand-*)` Fallback-Pattern.
//
// Skippt:
//   - Files mit `Token-Audit-Skip:` Header (PDF/Email/Mapbox/Error-Boundary/DiagPage)
//   - Files die NUR Hex aus der dokumentierten Whitelist enthalten (siehe DOCUMENTED_HEX)
//
// Die Whitelist spiegelt `src/lib/external-brand-colors.ts`:
//   - WhatsApp #25D366
//   - LinkedIn #0A66C2
//   - LexDrive #0e5be9
//   - SV-Typ-Map-Marker #3b82f6 #a855f7 #22c55e #0ea5e9 (siehe AAR-198)
//   - Landing-Hero-Cream #F5F1E8
//   - Navigation-Gold #C9A84C
//
// Verwendung:
//   node scripts/check-token-audit.mjs        # alle src-Files
//   node scripts/check-token-audit.mjs --staged  # nur staged Files (pre-commit-Hook)
//
// AGENTS.md §branding-rules: jede nicht-dokumentierte Hex-Verwendung ist falsch.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const STAGED = process.argv.includes('--staged')

// Whitelist — alle Hex die in src/lib/external-brand-colors.ts dokumentiert sind.
// Case-insensitive Vergleich.
const DOCUMENTED_HEX = new Set([
  '#25D366', // WhatsApp Brand Green
  '#0A66C2', // LinkedIn Brand Blue
  '#0e5be9', // LexDrive Kanzlei-Brand
  '#3b82f6', // SV-Typ Solo (AAR-198)
  '#a855f7', // SV-Typ Büro (AAR-198)
  '#22c55e', // SV-Typ Akademie (AAR-198)
  '#0ea5e9', // SV-Typ Community (AAR-198)
  '#F5F1E8', // Landing-Hero-Cream
  '#C9A84C', // Navigation-Gold
].map((h) => h.toLowerCase()))

// Pattern 1 — bracket-hex in Tailwind className (immer fail außer Whitelist).
const BRACKET_HEX_RE = /(?:bg|text|border|from|to|via|fill|stroke|ring|shadow|placeholder|divide|outline|decoration|accent|caret)-\[(#[0-9a-fA-F]{3,8})\]/g

// Pattern 2 — raw inline-hex in style={{ }} prüfen wir manuell (s.u.),
// damit `var(--brand-x, #hex)` Fallback-Pattern korrekt ignoriert wird.

const files = STAGED
  ? execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => f.startsWith('src/'))
  : execSync('git ls-files "src/**/*.tsx" "src/**/*.ts"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)

let hits = 0
const violationsByFile = new Map()

for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  // Skip-Header in den ersten 400 Zeichen prüfen
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue

  const recordViolation = (lineNumber, label, matched, line) => {
    if (!violationsByFile.has(file)) violationsByFile.set(file, [])
    violationsByFile.get(file).push({ lineNumber, label, matched: matched.slice(0, 80), line })
    hits++
  }
  const lineOf = (idx) => content.slice(0, idx).split('\n').length
  const trim = (s) => s.trim().slice(0, 160)

  // --- Pattern 1: bracket-hex ---
  BRACKET_HEX_RE.lastIndex = 0
  let m
  while ((m = BRACKET_HEX_RE.exec(content)) !== null) {
    const hex = m[1].toLowerCase()
    if (DOCUMENTED_HEX.has(hex) || hex === '#fff' || hex === '#ffffff' || hex === '#000' || hex === '#000000') continue
    const ln = lineOf(m.index)
    recordViolation(ln, 'arbitrary-hex in Tailwind-className', m[0], trim(content.split('\n')[ln - 1]))
  }

  // --- Pattern 2: raw inline-hex in style={{...}}, var()-Fallback erlaubt ---
  // Strategie: jeden `#[0-9a-f]{6,8}` finden, dann prüfen ob er als var()-Fallback
  // genutzt wird (Format `var(--xyz, #hex)`).
  const HEX_RE = /#[0-9a-fA-F]{6,8}(?![0-9a-fA-F])/g
  HEX_RE.lastIndex = 0
  while ((m = HEX_RE.exec(content)) !== null) {
    const hex = m[0].toLowerCase()
    if (DOCUMENTED_HEX.has(hex) || hex === '#ffffff' || hex === '#000000') continue
    // Nur Hex innerhalb von style={{...}}-Blöcken interessieren — Tailwind-bracket
    // ist schon oben abgehandelt. Skip Hex die in className/string-Literalen außerhalb
    // von style={{ stehen.
    // Heuristik: vor diesem Hex muss `style={{` näher liegen als `}}`.
    const before = content.slice(0, m.index)
    const lastStyleOpen = before.lastIndexOf('style={{')
    const lastStyleClose = before.lastIndexOf('}}')
    if (lastStyleOpen <= lastStyleClose) continue  // nicht in style-Block
    // Innerhalb style-Block: prüfen ob Hex als var()-Fallback genutzt wird.
    // Suche zwischen lastStyleOpen und m.index die nächste `var(--xxx, ` Sequenz.
    const styleSlice = content.slice(lastStyleOpen, m.index)
    const varFallbackOpen = styleSlice.lastIndexOf('var(--')
    const lastCloseParen = styleSlice.lastIndexOf(')')
    const isVarFallback = varFallbackOpen > -1 && varFallbackOpen > lastCloseParen
      && /var\(--[a-z-]+,\s*$/.test(styleSlice)
    if (isVarFallback) continue
    const ln = lineOf(m.index)
    recordViolation(ln, 'raw inline-hex in style={{ }} ohne var(--brand-*) Fallback', m[0], trim(content.split('\n')[ln - 1]))
  }
}

if (hits > 0) {
  for (const [file, vs] of violationsByFile) {
    console.error(`\n✗ ${file}`)
    for (const v of vs) {
      console.error(`  L${v.lineNumber} — ${v.label}`)
      console.error(`    matched: ${v.matched}`)
      console.error(`    line: ${v.line}`)
    }
  }
  console.error('')
  console.error(`${hits} Token-Audit-Verstöße in ${violationsByFile.size} Files.`)
  console.error('')
  console.error('Fix-Optionen:')
  console.error('  1. Hex auf claimondo-Token in className mappen (siehe src/lib/external-brand-colors.ts).')
  console.error('  2. Inline-style: hex → `var(--brand-*, #fallback)` umstellen (AGENTS.md §branding-rules).')
  console.error('  3. Wenn legitim (Email/PDF/Mapbox/Error-Boundary): Header `// Token-Audit-Skip: <Grund>` setzen.')
  console.error('  4. Wenn neue dokumentierte Brand-Farbe: in `external-brand-colors.ts` aufnehmen + hier Whitelist erweitern.')
  process.exit(1)
}

console.log(`✓ ${files.length} Files geprüft, keine Token-Audit-Verstöße.`)

// ─── AAR-906: Radii-Drift-Ratchet ──────────────────────────────────────────
// Tailwind-Default-Radien (rounded-sm/md/lg/xl/2xl/3xl/none) sollten durch
// Claimondo-Token-Radien (rounded-ios-sm/md/lg) ersetzt werden. Aktueller
// Stand ist nicht überall durchgezogen — wir fixieren den Baseline und
// blocken jede Erhöhung (Ratchet). `rounded-full` ist erlaubt (Avatare/Pills).
//
// Baseline-Update: nach jedem Migration-Batch hier den neuen, niedrigeren
// Wert eintragen und den Vorher-Wert im Kommentar dokumentieren.
const RADII_BASELINE_OCCURRENCES = 2073
const RADII_RE = /\brounded-(none|sm|md|lg|xl|2xl|3xl)\b/g

let radiiOccurrences = 0
const radiiFiles = new Set()
for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  // Skip-Header respektieren (selbe Konvention wie Hex-Audit)
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue
  RADII_RE.lastIndex = 0
  let r
  let fileHit = false
  while ((r = RADII_RE.exec(content)) !== null) {
    radiiOccurrences++
    fileHit = true
  }
  if (fileHit) radiiFiles.add(file)
}

const delta = radiiOccurrences - RADII_BASELINE_OCCURRENCES
if (delta > 0) {
  console.error('')
  console.error(
    `✗ Radii-Ratchet: ${radiiOccurrences} Tailwind-Default-Radii in ${radiiFiles.size} Files — Baseline ist ${RADII_BASELINE_OCCURRENCES}, Delta +${delta}.`,
  )
  console.error('')
  console.error('Neue rounded-sm/md/lg/xl/2xl/3xl/none-Klassen dürfen nicht hinzukommen.')
  console.error('Nutze stattdessen die Claimondo-Token-Radien:')
  console.error('  rounded-md  →  rounded-ios-md')
  console.error('  rounded-lg  →  rounded-ios-lg')
  console.error('  rounded-sm  →  rounded-ios-sm')
  console.error('(`rounded-full` für Avatare/Pills bleibt erlaubt.)')
  process.exit(1)
}

if (delta < 0) {
  console.log(
    `✓ Radii-Ratchet: ${radiiOccurrences} Default-Radii (${delta} unter Baseline) — Baseline kann nach diesem Merge auf ${radiiOccurrences} gesenkt werden.`,
  )
} else {
  console.log(`✓ Radii-Ratchet: ${radiiOccurrences} Default-Radii (= Baseline ${RADII_BASELINE_OCCURRENCES}).`)
}
