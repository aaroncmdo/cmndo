// Pure Scan-/Diff-Logik fuer die Component-Set-Drift-Bremse.
// Keine I/O, kein git — damit unit-testbar. CLI-Wrapper: ../check-component-set.mjs

// Solider Brand-Fill in einer statischen className="..." (claimondo-navy/ondo/shield
// oder var(--brand-primary|secondary)). (?!\/) schliesst Opacity-Tints aus
// (`bg-claimondo-navy/90`, `bg-[var(--brand-primary)]/5` = dezente Tint-/Toggle-
// Flaechen, KEINE soliden Primaer-Buttons — Boy-Scout-Befund 29.05.2026).
const BUTTON_FILL_RE =
  /className=["'`][^"'`]*(bg-claimondo-(navy|ondo|shield)(?!\/)|bg-\[var\(--brand-(primary|secondary)\)\](?!\/))/

// Liest den OEFFNENDEN Tag ab `<button` (inkl. schliessendem `>`) — Brace- und
// Quote-bewusst. Ein naives [^>]* bricht am ersten `>`, was bei inline-Arrow-
// Handlern (`onClick={() => ...}`) VOR dem className das className verfehlt
// (Under-Coverage-Blindspot, Boy-Scout 29.05.2026). Hier wird `>` innerhalb von
// `{...}` (beliebige Tiefe) und innerhalb von Strings/Templates uebersprungen.
// Quote-Tracking hat Vorrang vor Brace-Tracking (ein `{`/`}`/`>` im String zaehlt nicht).
function readOpeningTag(src, start) {
  let depth = 0
  let quote = null
  for (let k = start; k < src.length; k++) {
    const c = src[k]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      continue
    }
    if (c === '{') {
      depth++
      continue
    }
    if (c === '}') {
      if (depth > 0) depth--
      continue
    }
    if (c === '>' && depth === 0) {
      return src.slice(start, k + 1)
    }
  }
  return null
}

// True, wenn IRGENDEIN <button>-Oeffnungs-Tag eine statische className mit
// solidem Brand-Fill traegt. Tag-bewusst (s. readOpeningTag) statt regex-[^>]*,
// damit Buttons mit Arrow-Handler vor dem className NICHT durchrutschen.
function hasBrandFillButton(src) {
  let i = 0
  while ((i = src.indexOf('<button', i)) !== -1) {
    const next = src[i + 7]
    // Tag-Grenze: nach `<button` muss Whitespace, `>` oder `/` folgen
    // (kein `<buttonish`). EOF (undefined) -> readOpeningTag gibt null.
    if (next === undefined || /[\s/>]/.test(next)) {
      const tag = readOpeningTag(src, i)
      if (tag && BUTTON_FILL_RE.test(tag)) return true
    }
    i += 7
  }
  return false
}

export const PATTERNS = [
  {
    // Nur GEFUELLTE Primaer-Buttons flaggen — Chips/Toggles/Dropzones/Outline-
    // Buttons (kein Brand-Fill) + Opacity-Tints sind keine primitives.Button-Faelle.
    // Tag-bewusster Scan (Brace-Balancing) statt regex, damit Arrow-Handler vor
    // dem className den Button nicht verbergen.
    test: hasBrandFillButton,
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
  for (const p of PATTERNS) {
    const hit = p.test ? p.test(src) : p.re.test(src)
    if (hit) return p.msg
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
