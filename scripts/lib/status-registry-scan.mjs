// Pure Scan-/Diff-Logik fuer die Status-Registry-Drift-Bremse.
// Keine I/O, kein git — damit unit-testbar. CLI-Wrapper: ../check-status-registry.mjs
//
// Flaggt Files mit INLINE Status->Farb-Maps / Status-Farb-Ternaries, die
// stattdessen die zentrale @/lib/status-Registry nutzen sollen (resolveStatus /
// statusSlotClass / <StatusBadge domain=...> / <FallPhaseBadge>).
// Siehe AGENTS.md §status-registry. Skip via `status-registry-skip:`-Header.

// Semantische Status-Farb-Klassen + Marken-Tints + rohe Status-Scales.
// (Layout-Utilities wie flex/gap/px bewusst NICHT — nur Farb-Signale.)
const COLOR_CLASS =
  /\b(?:bg|text|border|ring)-(?:(?:success|warning|danger|info)(?:-soft|-strong)?|claimondo-[a-z-]+|(?:green|red|amber|yellow|orange|emerald|rose|lime|teal|blue|sky|indigo|violet|purple|cyan|fuchsia|pink)-\d{2,3})\b/

// Const-Namen die auf eine Status-/Farb-Map hindeuten.
const STATUS_MAP_NAME = /status|phase|badge|severity|prio|state|colou?rs?$|_cls$|_dot$|_bg$/i

// `const NAME(:type)? = {` — Startpunkt einer moeglichen Map.
const CONST_MAP_RE = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^={]+)?=\s*\{/g

// Status-Ternary -> Farb-Klasse: `x.status === 'offen' ? 'bg-warning-soft...`.
const STATUS_TERNARY_RE =
  /\b[\w.]*(?:status|phase|state|typ|prio|severity)\w*\s*===\s*['"][\w-]+['"]\s*\?\s*[`'"][^`'"]*\b(?:bg|text)-(?:success|warning|danger|info|claimondo|green|red|amber|yellow|orange|emerald|rose|lime|teal)/i

// Brace-gematchter Object-Body ab dem `{`-Index (quote-bewusst).
function objectBody(src, openIdx) {
  let depth = 0
  let quote = null
  for (let k = openIdx; k < src.length; k++) {
    const c = src[k]
    if (quote) {
      if (c === quote && src[k - 1] !== '\\') quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, k + 1) }
  }
  return src.slice(openIdx, openIdx + 1200)
}

// Gibt die erste passende Verletzungs-Message zurueck, sonst null.
export function scanContent(src) {
  if (/status-registry-skip/i.test(src.slice(0, 400))) return null

  // Pattern A — benannte Status-/Farb-Map mit Farb-Klassen im Body.
  CONST_MAP_RE.lastIndex = 0
  let m
  while ((m = CONST_MAP_RE.exec(src)) !== null) {
    const name = m[1]
    if (!STATUS_MAP_NAME.test(name)) continue
    const braceIdx = src.indexOf('{', m.index)
    if (braceIdx === -1) continue
    if (COLOR_CLASS.test(objectBody(src, braceIdx))) {
      return `inline Status-/Farb-Map \`${name}\` -> @/lib/status (resolveStatus/statusSlotClass/StatusBadge)`
    }
  }

  // Pattern B — Status-Farb-Ternary.
  if (STATUS_TERNARY_RE.test(src)) {
    return 'inline Status-Farb-Ternary -> @/lib/status (StatusBadge domain=... / statusSlotClass)'
  }

  return null
}

// added = neue Verletzer (CI rot). removed = behoben (Ratchet kann sinken).
export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((f) => !base.has(f)).sort(),
    removed: baselineFiles.filter((f) => !cur.has(f)).sort(),
  }
}
