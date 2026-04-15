// AAR-220: Theme-Generator. Aus einer Primary-Hex-Farbe wird via HSL-
// Manipulation ein vollständiges Whitelabel-Theme abgeleitet:
//
//   primary         — die Original-Farbe (dominante Logo-Farbe)
//   secondary       — etwas dunkler (für Hover-States)
//   accent          — heller + saturierter (für Active/Links/Highlights)
//   sidebarBg       — sehr dunkle Variante (≈10% Lightness) für Sidebar-Hintergrund
//   textOnPrimary   — automatisch Schwarz oder Weiß je nach Kontrast
//   surface         — sehr helle, leicht getönte Variante (≈97% Lightness)
//
// Beispiel Maschmeyer-Rot (#C41E3A):
//   primary:       #C41E3A
//   secondary:     #8B1528 (15% dunkler)
//   accent:        #E8354F (10% heller, +saturated)
//   sidebarBg:     #1A0A0E (sehr dunkel)
//   textOnPrimary: #FFFFFF
//   surface:       #FFF5F7 (sehr hell, getönt)

export type BrandTheme = {
  primary: string
  secondary: string
  accent: string
  sidebarBg: string
  textOnPrimary: string
  surface: string
}

// Default-Claimondo-Theme als Fallback wenn kein use_custom_branding aktiv ist.
export const CLAIMONDO_DEFAULT_THEME: BrandTheme = {
  primary: '#0D1B3E',
  secondary: '#1E3A5F',
  accent: '#4573A2',
  sidebarBg: '#0D1B3E',
  textOnPrimary: '#FFFFFF',
  surface: '#f8f9fb',
}

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

// WCAG-Relative Luminance für Kontrast-Entscheidung Schwarz vs. Weiß auf primary.
function relativeLuminance(r: number, g: number, b: number): number {
  const norm = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b)
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

export function generateTheme(primaryHex: string): BrandTheme {
  const primary = primaryHex.toUpperCase()
  const { r, g, b } = hexToRgb(primary)

  // textOnPrimary: WCAG-Kontrast — wenn primary hell genug ist, schwarz, sonst weiß.
  const lum = relativeLuminance(r, g, b)
  const textOnPrimary = lum > 0.5 ? '#0D0D0D' : '#FFFFFF'

  return {
    primary,
    secondary: adjustHsl(primary, 0, 0, -15),     // 15% dunkler
    accent: adjustHsl(primary, 0, 10, 10),        // 10% heller + saturierter
    sidebarBg: setLightness(primary, 8, 50),      // ~8% Lightness, max 50% sat (sehr dunkel, leicht getönt)
    textOnPrimary,
    surface: setLightness(primary, 97, 25),       // 97% Lightness, max 25% sat (sehr hell, fast weiß)
  }
}

// Fallback: aus Legacy brand_primary/brand_secondary ein Theme bauen wenn
// brand_theme noch nicht in der DB ist.
export function themeFromLegacy(primary: string | null, secondary: string | null): BrandTheme {
  if (!primary) return CLAIMONDO_DEFAULT_THEME
  const generated = generateTheme(primary)
  // Wenn explizite secondary vorhanden, override (User hat manuell gesetzt).
  return secondary ? { ...generated, secondary } : generated
}
