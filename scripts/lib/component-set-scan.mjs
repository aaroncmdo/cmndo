// Pure Scan-/Diff-Logik fuer die Component-Set-Drift-Bremse.
// Keine I/O, kein git — damit unit-testbar. CLI-Wrapper: ../check-component-set.mjs

export const PATTERNS = [
  {
    // Nur GEFUELLTE Primaer-Buttons flaggen (Brand-Fill: claimondo-navy/ondo/shield
    // oder var(--brand-primary|secondary)) — nicht jedes `rounded`. Chips, Toggles,
    // Dropzones, gestrichelte und Outline-Buttons (transparent/hell, ohne Brand-Fill)
    // sind keine primitives.Button-Faelle und waren bisher False-Positives
    // (Boy-Scout-Befund 29.05.2026). Tabs mit conditional bg-claimondo-shield bleiben
    // bewusst geflaggt (gehoeren auf ui/tabs, separater Pfad).
    //
    // (?!\/) schliesst Opacity-Tints aus: `bg-[var(--brand-primary)]/5`,
    // `bg-claimondo-navy/90` sind dezente Tint-/Toggle-Flaechen, KEINE soliden
    // Primaer-Buttons — sonst werden Layer-Toggles/Tint-Add-Buttons faelschlich
    // geflaggt und auf primitives.Button gezwungen (Boy-Scout-Befund 29.05.2026,
    // AuftragHeaderPanel/BueroOnboarding/gebiet).
    re: /<button\b[^>]*className=["'`][^"'`]*(bg-claimondo-(navy|ondo|shield)(?!\/)|bg-\[var\(--brand-(primary|secondary)\)\](?!\/))/,
    msg: 'handgerollter Primaer-<button> -> primitives.Button',
  },
  {
    re: /<div\b[^>]*className=["'`][^"'`]*bg-white[^"'`]*rounded[^"'`]*border[^"'`]*claimondo-border/,
    msg: 'handgerollte Section-Card-<div> -> primitives.Card / shared/SectionCard',
  },
  {
    re: /function\s+(StatCard|KpiCard|KpiBox|FilterChip|StatusPill|MiniDrawer|SectionCard|InfoRow|InfoCard)\b/,
    msg: 'lokale Reimplementierung eines shared-Pendants',
  },
  {
    re: /<table\b/,
    msg: 'handgerollte <table> -> shared/DataTable',
  },
]

// Gibt die erste passende msg zurueck, sonst null.
export function scanContent(src) {
  for (const { re, msg } of PATTERNS) {
    if (re.test(src)) return msg
  }
  return null
}

// added = in current, nicht in baseline (neue Verletzer -> CI rot).
// removed = in baseline, nicht in current (behoben -> Ratchet kann sinken).
export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((f) => !base.has(f)).sort(),
    removed: baselineFiles.filter((f) => !cur.has(f)).sort(),
  }
}
