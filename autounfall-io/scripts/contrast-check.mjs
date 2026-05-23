#!/usr/bin/env node
// Kontrast-Floor 0/0 · WCAG-Gate fuer das au.io-Token-System.
//
// Prueft alle sanktionierten Vordergrund/Hintergrund-Token-Paare gegen die
// WCAG-2.1-Schwellen (AA: 4.5:1 fuer normalen Text, 3:1 fuer grossen Text).
// „0/0" = null Verstoesse. Exit-Code 1 bei jedem Verstoss (CI-Gate).
//
// Hinweis: #FF7849 (au-amber-soft / „dekorativ") ist BEWUSST nicht als
// Text-auf-hell-Paar gelistet — es ist nicht textsicher (~2.7:1 weiss-drauf).
// Text-Akzent = #C04920 (au-amber / „textsicher", ~4.6:1 auf Paper).
//
// Foundation fuer WP-9 (dort wird der volle DOM-Sweep als Playwright-Spec
// portiert, contrast-sweep-scan.mjs). Token-Werte MUESSEN mit app/globals.css
// (@theme) synchron bleiben.

// ── au-Tokens (Spiegel von app/globals.css @theme) ──────────────────────────
const T = {
  ink: '#1E293B',
  inkSoft: '#334155',
  inkMuted: '#475569',
  amber: '#C04920', // Accent-strong, textsicher
  amberSoft: '#FF7849', // Accent dekorativ (NICHT fuer Text auf hell)
  amberDark: '#92400E', // textsicher auf paper-warm / Prose-Links
  paper: '#FAF7F0',
  paperWarm: '#F5EFE3',
  surface: '#FFFFFF',
  sand: '#F5E6D3',
  sandDark: '#E8DDD2',
  body: '#2E2A26',
  muted: '#57534E',
  success: '#15803D',
  danger: '#B91C1C',
  teal: '#0F6E56',
  teal50: '#E1F5EE',
  teal700: '#085041',
}

// ── WCAG-Mathematik ─────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function channelLuminance(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}
function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ── Sanktionierte Paare (Text + UI). minRatio default 4.5 (AA normaler Text),
//    3.0 fuer grosse Display-Headlines / UI-Komponenten-Grenzen. ───────────────
const PAIRS = [
  // Headings + Body auf hellen Flaechen
  { fg: T.ink, bg: T.paper, label: 'ink / paper' },
  { fg: T.ink, bg: T.surface, label: 'ink / surface' },
  { fg: T.ink, bg: T.sand, label: 'ink / sand' },
  { fg: T.ink, bg: T.paperWarm, label: 'ink / paper-warm' },
  { fg: T.inkSoft, bg: T.paper, label: 'ink-soft / paper' },
  { fg: T.inkSoft, bg: T.surface, label: 'ink-soft / surface' },
  { fg: T.inkMuted, bg: T.surface, label: 'ink-muted / surface' },
  { fg: T.muted, bg: T.paper, label: 'muted / paper' },
  { fg: T.body, bg: T.paper, label: 'body / paper' },
  // Accent-Text (textsicher) auf hell
  { fg: T.amber, bg: T.paper, label: 'amber / paper' },
  { fg: T.amber, bg: T.surface, label: 'amber / surface' },
  // au-amber (#C04920) ist auf paper-warm grenzwertig (4.35:1) → fuer Accent-Text
  // auf warmen Flaechen/Prose-Links das dunklere au-amber-dark (#92400E) nutzen.
  { fg: T.amberDark, bg: T.paperWarm, label: 'amber-dark / paper-warm' },
  { fg: T.amberDark, bg: T.surface, label: 'amber-dark / surface' },
  // Text auf dunklen / farbigen Flaechen
  { fg: T.surface, bg: T.ink, label: 'surface / ink' },
  { fg: T.surface, bg: T.amber, label: 'surface / amber (Button)' },
  // Semantic
  { fg: T.success, bg: T.surface, label: 'success / surface' },
  { fg: T.danger, bg: T.surface, label: 'danger / surface' },
  { fg: T.teal700, bg: T.teal50, label: 'teal-700 / teal-50' },
]

const FLOOR = 4.5

let failures = 0
const rows = PAIRS.map((p) => {
  const ratio = contrastRatio(p.fg, p.bg)
  const min = p.minRatio ?? FLOOR
  const ok = ratio >= min
  if (!ok) failures++
  return { label: p.label, ratio: ratio.toFixed(2), min, ok }
})

console.log('au.io Kontrast-Audit (WCAG AA)\n')
for (const r of rows) {
  console.log(`  ${r.ok ? 'OK ' : 'XX '} ${r.label.padEnd(28)} ${r.ratio}:1  (>= ${r.min})`)
}
console.log('')
if (failures > 0) {
  console.error(`Kontrast-Audit FEHLGESCHLAGEN: ${failures}/${PAIRS.length} Paar(e) unter dem Floor.`)
  process.exit(1)
}
console.log(`Kontrast-Audit OK: ${PAIRS.length}/${PAIRS.length} Paare bestanden (0 Verstoesse).`)
