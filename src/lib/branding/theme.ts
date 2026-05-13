// AAR-220 / AAR-419: Theme-Generator. Aus einer Primary-Hex-Farbe wird via HSL-
// Manipulation ein vollständiges Whitelabel-Theme abgeleitet.
//
// V1 (AAR-220, 6 Tokens):
//   primary, secondary, accent, sidebarBg, textOnPrimary, surface
//
// V2 (AAR-419, 24 Farb-Tokens + 2 Metadata):
//   Core:    primary + {Hover|Active|Soft}, secondary + {Hover|Active|Soft}, accent
//   Neutral: background, surface, surfaceMuted, border, borderStrong (mit Primary-Tint)
//   Text:    textPrimary, textSecondary, textMuted, textOnPrimary, textOnAccent
//   Sidebar: sidebarBg, sidebarText, sidebarActive, sidebarHover
//   Status:  success, warning, danger, info (Saturation an Primary harmonisiert)
//   Meta:    contrastSafe, version
//
// Backwards-Compat: V1-Keys bleiben PFLICHT, V2-Keys sind OPTIONAL auf BrandTheme.
// V1-Records in der DB werden von themeFromLegacy()/hydrateTheme() lazy
// auf V2 erweitert — `generateTheme()` liefert immer volles V2.

import { STATUS_COLOR_ANCHORS } from './defaults'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BrandTheme = {
  // V1 — bleiben required damit alte DB-Records (6-Key-JSONB) weiter
  // assignable sind an `BrandTheme | null`.
  primary: string
  secondary: string
  accent: string
  sidebarBg: string
  textOnPrimary: string
  surface: string

  // V2 Core-Palette
  primaryHover?: string
  primaryActive?: string
  primarySoft?: string
  secondaryHover?: string
  secondaryActive?: string
  secondarySoft?: string

  // V2 Neutrale (mit 3% Primary-Tint)
  background?: string
  surfaceMuted?: string
  border?: string
  borderStrong?: string

  // V2 Text
  textPrimary?: string
  textSecondary?: string
  textMuted?: string
  textOnAccent?: string

  // V2 Sidebar
  sidebarText?: string
  sidebarActive?: string
  sidebarHover?: string

  // V2 Status (harmonisiert mit Primary)
  success?: string
  successSoft?: string
  warning?: string
  warningSoft?: string
  danger?: string
  dangerSoft?: string
  info?: string

  // V2 Typography (AAR-421): Referenz auf ein Paar aus dem Font-Registry
  // (src/lib/branding/fonts.ts). Null → Claimondo-Default (kanoo_1). Consumer
  // laden via getFontPair(fontPairId) → cssStack. Die Font-Metadaten selbst
  // (family, weights) bleiben im Registry, hier nur die ID damit das Theme
  // portable bleibt und nicht mit Google-Fonts-URLs versionsabhängig wird.
  fontPairId?: string | null

  // AAR-456: Claude-Vision Empfehlung (racing|elegance|kanoo). Wird
  // persistiert, damit der "Empfohlen"-Badge im FontPicker auch nach Reload
  // angezeigt wird — sonst geht die Info nach jedem Page-Refresh verloren.
  fontCategoryRecommendation?: 'racing' | 'elegance' | 'kanoo' | null

  // V2 Metadata
  contrastSafe?: boolean
  version?: number
}

// Voll-hydratisiertes V2-Theme (alle Keys present). Ergebnis von
// generateTheme() und themeFromLegacy(). Für Consumer die V2-Felder garantiert
// brauchen — zB Full-Branding-Modus im Sidebar.
export type BrandThemeV2 = Required<BrandTheme>

// ─────────────────────────────────────────────────────────────────────────────
// Default Claimondo-Theme (V2-vollständig)
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIMONDO_DEFAULT_THEME: BrandThemeV2 = {
  version: 2,
  contrastSafe: true,
  // Core
  primary: '#0D1B3E',
  primaryHover: '#1A2A55',
  primaryActive: '#06112B',
  primarySoft: '#E8EDF5',
  secondary: '#4573A2',
  secondaryHover: '#3A6391',
  secondaryActive: '#2E5278',
  secondarySoft: '#EEF3F9',
  accent: '#7BA3CC',
  // Neutrale
  background: '#F8F9FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F3F7',
  border: '#E4E7ED',
  borderStrong: '#C9CED7',
  // Text
  textPrimary: '#0D1B3E',
  textSecondary: '#4A5568',
  textMuted: '#8A93A3',
  textOnPrimary: '#FFFFFF',
  textOnAccent: '#0D1B3E',
  // Sidebar
  sidebarBg: '#0D1B3E',
  sidebarText: '#FFFFFF',
  sidebarActive: '#1E3A5F',
  sidebarHover: 'rgba(255,255,255,0.08)',
  // Status
  success: '#10B981',
  successSoft: '#ECFDF5',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  info: '#3B82F6',
  // Typography — null = Claimondo-Default (kanoo_1, Inter/Inter).
  fontPairId: null,
  // AAR-456: Default-Theme hat keine Empfehlung — wird erst nach Logo-Upload
  // via Claude-Vision gesetzt.
  fontCategoryRecommendation: null,
}

// Alias-Name für neue V2-Consumer, die den Schema-Stand explizit referenzieren wollen.
export const CLAIMONDO_DEFAULT_THEME_V2 = CLAIMONDO_DEFAULT_THEME

// ─────────────────────────────────────────────────────────────────────────────
// Color-Math (Hex ↔ RGB ↔ HSL, WCAG-Luminance)
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6)
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rN = r / 255, gN = g / 255, bN = b / 255
  const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break
      case gN: h = (bN - rN) / d + 2; break
      case bN: h = (rN - gN) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hN = h / 360, sN = s / 100, lN = l / 100
  if (sN === 0) {
    const v = lN * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN
  const p = 2 * lN - q
  return {
    r: hue2rgb(p, q, hN + 1 / 3) * 255,
    g: hue2rgb(p, q, hN) * 255,
    b: hue2rgb(p, q, hN - 1 / 3) * 255,
  }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const norm = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b)
}

// Kontrast-Ratio nach WCAG (1.0 - 21.0). AA normal = 4.5, AA large = 3.0.
function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  const lA = relativeLuminance(a.r, a.g, a.b)
  const lB = relativeLuminance(b.r, b.g, b.b)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

function adjustHsl(hex: string, dh: number, ds: number, dl: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const adjusted = hslToRgb(
    (h + dh + 360) % 360,
    Math.max(0, Math.min(100, s + ds)),
    Math.max(0, Math.min(100, l + dl)),
  )
  return rgbToHex(adjusted.r, adjusted.g, adjusted.b)
}

function setLightness(hex: string, targetL: number, sCap?: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s } = rgbToHsl(r, g, b)
  const finalS = sCap != null ? Math.min(s, sCap) : s
  const out = hslToRgb(h, finalS, targetL)
  return rgbToHex(out.r, out.g, out.b)
}

function mixWithWhite(hex: string, whiteRatio: number): string {
  const { r, g, b } = hexToRgb(hex)
  const w = Math.max(0, Math.min(1, whiteRatio))
  return rgbToHex(r + (255 - r) * w, g + (255 - g) * w, b + (255 - b) * w)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Palette-Generators
// ─────────────────────────────────────────────────────────────────────────────

// Neutrale mit dezentem Primary-Tint (3% Saturation). Macht die UI warm bei
// warmen Logos und kühl bei kühlen Logos — ohne dominant zu werden.
export function generateNeutrals(primaryHex: string): {
  background: string
  surface: string
  surfaceMuted: string
  border: string
  borderStrong: string
} {
  const { r, g, b } = hexToRgb(primaryHex)
  const { h } = rgbToHsl(r, g, b)
  // Feste Saturation 3%, nur Hue aus Primary. Alle Lightness-Werte fix.
  const tint = (l: number) => rgbToHex(
    hslToRgb(h, 3, l).r,
    hslToRgb(h, 3, l).g,
    hslToRgb(h, 3, l).b,
  )
  return {
    background: tint(97),   // dezenter Ambient-BG
    surface: tint(100),     // reines Weiß für Karten (Tint auf 100% = Weiß, aber konsistent)
    surfaceMuted: tint(95), // Alt-Rows, Hover
    border: tint(88),       // Standard-Borders
    borderStrong: tint(78), // betonte Borders (Divider-Lines)
  }
}

// Status-Farben mit harmonisierter Saturation. Anker-Hue bleibt semantisch
// (grün/gelb/rot/blau) — aber Saturation wird an Primary angeglichen, damit
// ein hochgesättigtes Logo keine stumpfen Status-Tags bekommt (und umgekehrt).
export function generateStatus(primaryHex: string): {
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  info: string
} {
  const { r, g, b } = hexToRgb(primaryHex)
  const { s: primarySat } = rgbToHsl(r, g, b)
  // Saturation bleibt zwischen 55% und 85% — hoch genug für Lesbarkeit,
  // nicht so hoch dass es gegen gedämpfte Primaries billig wirkt.
  const targetSat = Math.max(55, Math.min(85, primarySat * 0.9 + 20))

  const harmonize = (anchorHex: string) => {
    const a = hexToRgb(anchorHex)
    const { h: anchorH, l: anchorL } = rgbToHsl(a.r, a.g, a.b)
    const out = hslToRgb(anchorH, targetSat, anchorL)
    return rgbToHex(out.r, out.g, out.b)
  }

  // Soft-Variante: gleicher Hue, niedrige Saturation (12%), hohe Lightness (96%).
  // Ergibt einen blassen Tint für Background-Pillen (Card-BG zu success/warning/danger).
  const softTint = (anchorHex: string) => {
    const a = hexToRgb(anchorHex)
    const { h: anchorH } = rgbToHsl(a.r, a.g, a.b)
    const out = hslToRgb(anchorH, 12, 96)
    return rgbToHex(out.r, out.g, out.b)
  }

  return {
    success: harmonize(STATUS_COLOR_ANCHORS.success),
    successSoft: softTint(STATUS_COLOR_ANCHORS.success),
    warning: harmonize(STATUS_COLOR_ANCHORS.warning),
    warningSoft: softTint(STATUS_COLOR_ANCHORS.warning),
    danger: harmonize(STATUS_COLOR_ANCHORS.danger),
    dangerSoft: softTint(STATUS_COLOR_ANCHORS.danger),
    info: harmonize(STATUS_COLOR_ANCHORS.info),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WCAG-Validation
// ─────────────────────────────────────────────────────────────────────────────

// Prüft die kritischen Kontrast-Paarungen im Theme. Schwelle 3.0 = WCAG AA
// Large Text (unsere Buttons/Badges sind meist >=14pt bold).
export function ensureContrastSafe(theme: Pick<BrandTheme,
  'primary' | 'textOnPrimary' | 'sidebarBg' | 'sidebarText' | 'accent' | 'textOnAccent' | 'background' | 'textPrimary'
>): boolean {
  const checks: Array<[string, string]> = [
    [theme.primary, theme.textOnPrimary],
    [theme.sidebarBg, theme.sidebarText ?? '#FFFFFF'],
    [theme.accent, theme.textOnAccent ?? '#0D1B3E'],
    [theme.background ?? '#FFFFFF', theme.textPrimary ?? '#0D1B3E'],
  ]
  return checks.every(([a, b]) => contrastRatio(a, b) >= 3.0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateTheme(primaryHex: string): BrandThemeV2 {
  const primary = primaryHex.toUpperCase()
  const { r, g, b } = hexToRgb(primary)
  const { l: lightness } = rgbToHsl(r, g, b)

  // textOnPrimary: WCAG-Kontrast — wenn primary hell genug ist, schwarz, sonst weiß.
  const lum = relativeLuminance(r, g, b)
  const textOnPrimary = lum > 0.5 ? '#0D0D0D' : '#FFFFFF'

  // secondary muss VISIBLE bleiben gegen sidebarBg (immer L=8). Bei dunklen
  // Primaries (z.B. Claimondo-Navy L=15) würde -15% L = 0% = schwarz =
  // unsichtbarer Active-State. Daher: bei L<30 → heller statt dunkler.
  const secondary = lightness < 30
    ? setLightness(primary, Math.min(35, lightness + 15))
    : adjustHsl(primary, 0, 0, -15)

  const accent = adjustHsl(primary, 0, 10, 10)

  // Primary/Secondary-Varianten
  const primaryHover = adjustHsl(primary, 0, 0, -8)
  const primaryActive = adjustHsl(primary, 0, 0, -15)
  const primarySoft = mixWithWhite(primary, 0.9)      // ~95% L Mischung

  const secondaryHover = adjustHsl(secondary, 0, 0, -6)
  const secondaryActive = adjustHsl(secondary, 0, 0, -12)
  const secondarySoft = mixWithWhite(secondary, 0.9)

  // Neutrale + Status (Sub-Palettes)
  const neutrals = generateNeutrals(primary)
  const status = generateStatus(primary)

  // Text-Paletten auf neutralen BG
  const textPrimary = '#0D1B3E'      // dunkel genug auf allen Tint-Weiß-Backgrounds
  const textSecondary = '#4A5568'
  const textMuted = '#8A93A3'
  const textOnAccent = relativeLuminance(
    hexToRgb(accent).r, hexToRgb(accent).g, hexToRgb(accent).b,
  ) > 0.5 ? '#0D0D0D' : '#FFFFFF'

  // Sidebar
  const sidebarBg = setLightness(primary, 8, 50)
  const sidebarText = '#FFFFFF'
  const sidebarActive = secondary
  const sidebarHover = 'rgba(255,255,255,0.08)'

  const baseTheme: Omit<BrandThemeV2, 'contrastSafe' | 'version'> = {
    primary,
    primaryHover,
    primaryActive,
    primarySoft,
    secondary,
    secondaryHover,
    secondaryActive,
    secondarySoft,
    accent,
    background: neutrals.background,
    surface: neutrals.surface,
    surfaceMuted: neutrals.surfaceMuted,
    border: neutrals.border,
    borderStrong: neutrals.borderStrong,
    textPrimary,
    textSecondary,
    textMuted,
    textOnPrimary,
    textOnAccent,
    sidebarBg,
    sidebarText,
    sidebarActive,
    sidebarHover,
    success: status.success,
    successSoft: status.successSoft,
    warning: status.warning,
    warningSoft: status.warningSoft,
    danger: status.danger,
    dangerSoft: status.dangerSoft,
    info: status.info,
    // Font-Pair wird nicht aus der Primary-Farbe abgeleitet — Claude-Vision
    // (AAR-420) oder der User setzt das separat. Default null = kanoo_1.
    fontPairId: null,
    // AAR-456: Empfehlung wird in handleFile() aus extractJson gesetzt —
    // generateTheme selbst kennt die Claude-Antwort nicht.
    fontCategoryRecommendation: null,
  }

  const contrastSafe = ensureContrastSafe(baseTheme)

  return { ...baseTheme, contrastSafe, version: 2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy / Hydrate
// ─────────────────────────────────────────────────────────────────────────────

// Fallback: aus Legacy brand_primary/brand_secondary ein V2-Theme bauen wenn
// brand_theme noch nicht in der DB ist.
export function themeFromLegacy(primary: string | null, secondary: string | null): BrandThemeV2 {
  if (!primary) return CLAIMONDO_DEFAULT_THEME
  const generated = generateTheme(primary)
  // Wenn explizite secondary vorhanden, Override (User hat manuell gesetzt) —
  // aber nur das core-secondary; die abgeleiteten Hover/Active/Soft neu berechnen.
  if (!secondary) return generated
  return {
    ...generated,
    secondary,
    secondaryHover: adjustHsl(secondary, 0, 0, -6),
    secondaryActive: adjustHsl(secondary, 0, 0, -12),
    secondarySoft: mixWithWhite(secondary, 0.9),
  }
}

// AAR-419: Nimmt einen beliebigen rohen brand_theme-Eintrag aus der DB und
// garantiert ein voll-hydratisiertes V2-Theme zurück.
// - null/undefined → themeFromLegacy(fallbackPrimary, fallbackSecondary)
// - V1-Record (6 Keys, kein `version`) → generateTheme(stored.primary) mit
//   explizit gesetzten V1-Overrides (falls User sie manuell editiert hat)
// - V2-Record (version===2) → Cast mit Default-Filling für fehlende Keys
export function hydrateTheme(
  stored: Partial<BrandTheme> | null | undefined,
  fallbackPrimary?: string | null,
  fallbackSecondary?: string | null,
): BrandThemeV2 {
  if (!stored || typeof stored !== 'object' || !stored.primary) {
    return themeFromLegacy(fallbackPrimary ?? null, fallbackSecondary ?? null)
  }

  // V1-Record (kein version-Feld): Behandle stored.secondary als User-Override
  // und leite Hover/Active/Soft davon ab — sonst bleiben die Variants auf dem
  // Primary-abgeleiteten Auto-Secondary gekeyed (gleicher Bug wie in
  // branding-actions.ts Pre-Follow-up).
  if (stored.version !== 2) {
    const base = themeFromLegacy(stored.primary, stored.secondary ?? null)
    // Explizit gesetzte V1-Keys (accent, sidebarBg, textOnPrimary, surface)
    // als User-Edit respektieren.
    return { ...base, ...stored, version: 2 } as BrandThemeV2
  }

  // V2-Record: Voll-Generator auf Basis von stored.primary; dann alle
  // explizit gesetzten Keys aus stored überschreiben.
  const generated = generateTheme(stored.primary)
  return { ...generated, ...stored, version: 2 } as BrandThemeV2
}
