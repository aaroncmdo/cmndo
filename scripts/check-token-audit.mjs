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
  '#1ebf5a', // WhatsApp Brand Green Hover/Active (dunkler)
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
// 14.05.2026: 351 → 355 (+4) durch PRs #1130 (Liquid-Glass-Cockpit) und
// #1140 (Mini-Wizard SV-Auto-Match) eingebracht, nicht im verursachenden
// PR ge-ratchetet. Hier auf den neuen Stand angehoben.
const RADII_BASELINE_OCCURRENCES = 236
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

// ─── AAR-909: Accent-Default-Ratchet ───────────────────────────────────────
// Tailwind-Default-Akzentfarben (blue/indigo/sky/cyan/violet/purple/teal/
// fuchsia/pink) sind in UI-Akzenten verboten — Brand-Akzente kommen über
// `claimondo-*`-Tokens. Status-Farben (green/emerald/red/rose/amber/yellow/
// orange/lime) haben seit der Token-Foundation eigene Tokens + einen eigenen
// Status-Ratchet (s.u.) — sie werden hier (Accent-Ratchet) NICHT geprueft.
//
// Baseline = 0 (alle aktuellen Treffer sind in Files mit dokumentiertem
// Token-Audit-Skip-Header, z.B. WeatherBanner.tsx für literale Himmelsfarben).
const ACCENT_BASELINE_OCCURRENCES = 0
const ACCENT_RE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|placeholder|decoration|accent|divide)-(?:blue|indigo|sky|cyan|violet|purple|teal|fuchsia|pink)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g

let accentOccurrences = 0
const accentFiles = new Set()
const accentExamples = []
for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue
  ACCENT_RE.lastIndex = 0
  let a
  let fileHit = false
  while ((a = ACCENT_RE.exec(content)) !== null) {
    accentOccurrences++
    fileHit = true
    if (accentExamples.length < 5) {
      const line = content.slice(0, a.index).split('\n').length
      accentExamples.push(`  ${file}:${line} — ${a[0]}`)
    }
  }
  if (fileHit) accentFiles.add(file)
}

const accentDelta = accentOccurrences - ACCENT_BASELINE_OCCURRENCES
if (accentDelta > 0) {
  console.error('')
  console.error(
    `✗ Accent-Ratchet: ${accentOccurrences} Default-Akzent-Farben in ${accentFiles.size} Files — Baseline ist ${ACCENT_BASELINE_OCCURRENCES}, Delta +${accentDelta}.`,
  )
  console.error('')
  console.error('Beispiele:')
  for (const ex of accentExamples) console.error(ex)
  console.error('')
  console.error('Nutze stattdessen die Claimondo-Brand-Tokens:')
  console.error('  text-blue-500   →  text-claimondo-ondo / text-claimondo-light-blue')
  console.error('  bg-indigo-600   →  bg-claimondo-navy / bg-claimondo-shield')
  console.error('  border-cyan-400 →  border-claimondo-border / border-claimondo-ondo')
  console.error('')
  console.error('Bei legitimer Verwendung (Wetter-Daten, externe Brand-Farbe etc.):')
  console.error('  `// Token-Audit-Skip: <Grund>` Header in den ersten 400 Zeichen setzen.')
  console.error('')
  console.error('(Status-Farben green/emerald/red/rose/amber/yellow/orange: eigener Status-Ratchet s.u. — nutze bg-success/-soft, text-danger-strong etc.)')
  process.exit(1)
}

if (accentDelta < 0) {
  console.log(
    `✓ Accent-Ratchet: ${accentOccurrences} Default-Akzente (${accentDelta} unter Baseline) — Baseline kann auf ${accentOccurrences} gesenkt werden.`,
  )
} else {
  console.log(`✓ Accent-Ratchet: ${accentOccurrences} Default-Akzente (= Baseline ${ACCENT_BASELINE_OCCURRENCES}).`)
}

// ─── Token-Foundation: Status-Color-Ratchet ────────────────────────────────
// Status-Farben haben seit der Token-Foundation eigene Tailwind-Tokens:
//   bg-success / bg-success-soft / text-success-strong   (analog warning/danger/info)
// gebunden an src/lib/design-tokens.ts (Brand-Resolver: branden auf Whitelabel
// mit). Damit loest dieser Ratchet die fruehere "Status bleibt raw erlaubt"-
// Ausnahme ab: raw Tailwind-Status-Scales (green/emerald/red/rose/amber/yellow/
// orange/lime) werden geratchet — Bestand bleibt (Boy-Scout-Abbau), NEUE
// Verstoesse werden geblockt.
//
// Echte Nicht-Status-Faelle bleiben legitim und gehoeren NICHT migriert:
//   - Wetter-Farben (WeatherWidget), Kanal-Identitaet (WhatsApp-Gruen im
//     MultiChannelChat), Trust-Marker, Data-Viz/Charts, Map-Marker.
//   Diese bekommen einen `// Token-Audit-Skip: <Grund>`-Header (dann komplett
//   geskippt) — oder bleiben im Bestand grandfathered bis sie angefasst werden.
//
// Baseline-Update: nach jedem Migrations-Batch den neuen, niedrigeren Wert
// hier eintragen (Script nennt ihn bei Delta < 0).
// 10.06.2026: 3115 -> 3007 (-108) durch Welle-1 Shared-Layer-Status-Migration
// (statusLabels.ts STATUS_SLOT_CLASSES + ~22 shared-Components auf success/
// warning/danger/info-Tokens). SCHADENS_URSACHE + Rating/Action-Hovers = LEAVE.
// 25.06.2026: 3007 -> 1919 (-1088) durch admin-Status-Token-Lane (Batch 1-13,
// PRs #2675/#3113/#3116/#3121/#3124/#3128/#3131/#3136/#3139/#3142/#3143/#3145/#3146:
// SV-Verwaltung, Kanban/Tasks, Update-Widgets, Team, fallakte, Communities,
// Vertraege, SLA, Kanzlei-Pages, Kalender, admin-Tail-Cleanup, finance-(hub)).
// LEAVE (grandfathered): Data-Viz/Geld (finance -400-Palette, Charts, KPI-Metriken)
// + Typ-/Rollen-Identitaets-Maps + Delete-Hovers + inline-hex Map-Paint.
// 24.08.2026: 494 -> 489. Zwei Warnhinweise im Gutachter-Portal (termine/[id]
// und PolizeiberichtUpload) trugen `bg-amber-50 border-l-4 border-amber-500` —
// raw Status-Scale UND Side-Stripe. Beim Entfernen des Side-Stripes (impeccable
// „absolute ban") gleich auf die warning-Tokens gezogen: Boy-Scout.
const STATUS_BASELINE_OCCURRENCES = 489
const STATUS_RE = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|placeholder|decoration|accent|divide)-(?:green|emerald|red|rose|amber|yellow|orange|lime)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g

let statusOccurrences = 0
const statusFiles = new Set()
const statusExamples = []
for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue
  STATUS_RE.lastIndex = 0
  let s
  let fileHit = false
  while ((s = STATUS_RE.exec(content)) !== null) {
    statusOccurrences++
    fileHit = true
    if (statusExamples.length < 5) {
      const line = content.slice(0, s.index).split('\n').length
      statusExamples.push(`  ${file}:${line} — ${s[0]}`)
    }
  }
  if (fileHit) statusFiles.add(file)
}

const statusDelta = statusOccurrences - STATUS_BASELINE_OCCURRENCES
if (statusDelta > 0) {
  console.error('')
  console.error(
    `✗ Status-Ratchet: ${statusOccurrences} raw Status-Scales in ${statusFiles.size} Files — Baseline ist ${STATUS_BASELINE_OCCURRENCES}, Delta +${statusDelta}.`,
  )
  console.error('')
  console.error('Beispiele:')
  for (const ex of statusExamples) console.error(ex)
  console.error('')
  console.error('Status-Farben haben jetzt Tokens (src/lib/design-tokens.ts + globals.css):')
  console.error('  bg-green-50 / bg-emerald-50    →  bg-success-soft')
  console.error('  text-green-700 / -800 / -900   →  text-success-strong')
  console.error('  text-green-500 / -600          →  text-success   (analog warning/danger/info)')
  console.error('  text-red-500 / bg-red-50       →  text-danger-strong / bg-danger-soft')
  console.error('  bg-amber-50 / text-amber-800   →  bg-warning-soft / text-warning-strong')
  console.error('')
  console.error('Echter Nicht-Status-Fall (Wetter/Kanal-Farbe/Trust-Marker/Data-Viz/Map):')
  console.error('  `// Token-Audit-Skip: <Grund>` Header in den ersten 400 Zeichen setzen.')
  process.exit(1)
}

if (statusDelta < 0) {
  console.log(
    `✓ Status-Ratchet: ${statusOccurrences} raw Status-Scales (${statusDelta} unter Baseline) — Baseline kann auf ${statusOccurrences} gesenkt werden.`,
  )
} else {
  console.log(`✓ Status-Ratchet: ${statusOccurrences} raw Status-Scales (= Baseline ${STATUS_BASELINE_OCCURRENCES}).`)
}

// ─── Whitelabel: Brand-rgba-in-Gradient-Ratchet ────────────────────────────
// Ambient-Brand-Leaks: raw rgba() mit Claimondo-Marken-Toenen INNERHALB einer
// CSS-*-gradient()-Funktion branden NICHT mit (anders als der etablierte
// color-mix(in srgb, var(--brand-*, #fb) N%, transparent)-Pattern, ~40 Consumer).
// Der Hex-Audit (oben) prueft nur Hex, nicht rgba — diese Luecke schliesst dieser
// Ratchet fuer den haeufigsten + sichtbarsten Leak-Typ: Ambient-Hintergrund-
// Verlaeufe auf kunden-/SV-gebrandeten Flaechen (FlowLink-Audit 2026-06-10).
//
// NUR Gradient-Kontext = hohe Praezision, ~0 False-Positives: Schatten
// (boxShadow/drop-shadow), Avatar-/Badge-Fills, Mapbox-Paint-Arrays und
// Native-rgba (RN hat kein color-mix/CSS-Vars) nutzen rgba LEGITIM und werden
// NICHT erfasst. .native.tsx ist zusaetzlich ausgeschlossen.
//
// Baseline = Bestand (grandfathered): auth (passwort-*) + admin-Layout-Ambient
// sind Claimondo-only / nicht whitelabel-gebrandet → keine echten Leaks; makler
// = Follow-up (B2B-brandbar). Boy-Scout senkt. Neue Brand-rgba-Gradienten werden
// geblockt → auf das color-mix-var-Pattern umstellen.
const BRAND_RGBA_GRADIENT_BASELINE = 10
const BRAND_RGBA_GRADIENT_RE = /(?:linear|radial|conic)-gradient\([^;{}\n]*?rgba\(\s*(?:13\s*,\s*27\s*,\s*62|69\s*,\s*115\s*,\s*162|123\s*,\s*163\s*,\s*204)\b/g

let brandRgbaOccurrences = 0
const brandRgbaFiles = new Set()
const brandRgbaExamples = []
for (const file of files) {
  if (/\.native\.tsx$/.test(file)) continue
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue
  BRAND_RGBA_GRADIENT_RE.lastIndex = 0
  let g
  let fileHit = false
  while ((g = BRAND_RGBA_GRADIENT_RE.exec(content)) !== null) {
    brandRgbaOccurrences++
    fileHit = true
    if (brandRgbaExamples.length < 5) {
      const line = content.slice(0, g.index).split('\n').length
      brandRgbaExamples.push(`  ${file}:${line}`)
    }
  }
  if (fileHit) brandRgbaFiles.add(file)
}

const brandRgbaDelta = brandRgbaOccurrences - BRAND_RGBA_GRADIENT_BASELINE
if (brandRgbaDelta > 0) {
  console.error('')
  console.error(
    `✗ Brand-rgba-Gradient-Ratchet: ${brandRgbaOccurrences} raw Brand-rgba in CSS-Gradienten (${brandRgbaFiles.size} Files) — Baseline ist ${BRAND_RGBA_GRADIENT_BASELINE}, Delta +${brandRgbaDelta}.`,
  )
  console.error('')
  console.error('Beispiele:')
  for (const ex of brandRgbaExamples) console.error(ex)
  console.error('')
  console.error('Brand-Toene in Gradienten branden nicht mit. Nutze das color-mix-var-Pattern:')
  console.error('  rgba(123,163,204,.18)  →  color-mix(in srgb, var(--brand-accent, #7BA3CC) 18%, transparent)')
  console.error('  rgba(69,115,162,.08)   →  color-mix(in srgb, var(--brand-secondary, #4573A2) 8%, transparent)')
  console.error('  rgba(13,27,62,.55)     →  color-mix(in srgb, var(--brand-primary, #0D1B3E) 55%, transparent)')
  console.error('(Schatten/Avatare/Badges/Mapbox/Native nutzen rgba legitim — dieser Ratchet erfasst nur Gradient-Fills.)')
  process.exit(1)
}

if (brandRgbaDelta < 0) {
  console.log(
    `✓ Brand-rgba-Gradient-Ratchet: ${brandRgbaOccurrences} Brand-rgba-Gradienten (${brandRgbaDelta} unter Baseline) — Baseline kann auf ${brandRgbaOccurrences} gesenkt werden.`,
  )
} else {
  console.log(`✓ Brand-rgba-Gradient-Ratchet: ${brandRgbaOccurrences} Brand-rgba-Gradienten (= Baseline ${BRAND_RGBA_GRADIENT_BASELINE}).`)
}
