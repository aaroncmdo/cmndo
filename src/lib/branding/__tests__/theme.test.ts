import { describe, it, expect } from 'vitest'
import {
  generateTheme,
  generateNeutrals,
  generateStatus,
  ensureContrastSafe,
  themeFromLegacy,
  hydrateTheme,
  CLAIMONDO_DEFAULT_THEME,
} from '../theme'

// AAR-419: Theme-V2-Schema-Tests.

const V2_KEYS = [
  // Core
  'primary', 'primaryHover', 'primaryActive', 'primarySoft',
  'secondary', 'secondaryHover', 'secondaryActive', 'secondarySoft',
  'accent',
  // Neutrale
  'background', 'surface', 'surfaceMuted', 'border', 'borderStrong',
  // Text
  'textPrimary', 'textSecondary', 'textMuted', 'textOnPrimary', 'textOnAccent',
  // Sidebar
  'sidebarBg', 'sidebarText', 'sidebarActive', 'sidebarHover',
  // Status
  'success', 'warning', 'danger', 'info',
  // Meta
  'contrastSafe', 'version',
] as const

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

describe('generateTheme V2', () => {
  it('produces all 25 tokens + metadata for Claimondo Navy', () => {
    const theme = generateTheme('#0D1B3E')
    for (const k of V2_KEYS) {
      expect(theme[k], `expected key "${k}"`).toBeDefined()
    }
    expect(theme.version).toBe(2)
    expect(typeof theme.contrastSafe).toBe('boolean')
  })

  it('picks white textOnPrimary for dark primaries (Navy)', () => {
    const theme = generateTheme('#0D1B3E')
    expect(theme.textOnPrimary).toBe('#FFFFFF')
  })

  it('picks dark textOnPrimary for light primaries (Neon-Gelb)', () => {
    const theme = generateTheme('#FFFF00')
    expect(theme.textOnPrimary).toBe('#0D0D0D')
  })

  it('picks white textOnPrimary for Maschmeyer-Rot (mittel-dunkel)', () => {
    const theme = generateTheme('#C41E3A')
    expect(theme.textOnPrimary).toBe('#FFFFFF')
  })

  it('generates distinct hover/active/soft variants', () => {
    const theme = generateTheme('#C41E3A')
    expect(theme.primaryHover).not.toBe(theme.primary)
    expect(theme.primaryActive).not.toBe(theme.primaryHover)
    expect(theme.primarySoft).not.toBe(theme.primary)
    // primarySoft muss deutlich heller sein als primary
    const lSoft = hexToHsl(theme.primarySoft!).l
    const lPrimary = hexToHsl(theme.primary).l
    expect(lSoft).toBeGreaterThan(lPrimary + 30)
  })
})

describe('generateNeutrals', () => {
  it('returns neutrals with low saturation (unter 10%)', () => {
    // Leichter Tint-Korridor — S=3% im HSL-Space, durch RGB-Round-Trip
    // verschieben sich Neutrale um bis zu ~7% im Messwert.
    const n = generateNeutrals('#C41E3A')
    for (const hex of Object.values(n)) {
      expect(hexToHsl(hex).s).toBeLessThanOrEqual(10)
    }
  })

  it('tints neutrals with primary hue for warm primary', () => {
    const n = generateNeutrals('#C41E3A') // rot = Hue ~350
    // Border hat noch 3% Saturation → Hue sollte messbar sein und warm (0-60 oder 300-360)
    const borderHue = hexToHsl(n.border).h
    const inWarmRange = borderHue < 60 || borderHue > 300
    expect(inWarmRange).toBe(true)
  })

  it('tints neutrals with primary hue for cool primary', () => {
    const n = generateNeutrals('#1E40AF') // blau = Hue ~225
    const borderHue = hexToHsl(n.border).h
    // Kühle Hue-Range: 180-280
    expect(borderHue).toBeGreaterThan(170)
    expect(borderHue).toBeLessThan(290)
  })
})

describe('generateStatus', () => {
  it('keeps semantic hues (green/yellow/red/blue)', () => {
    const s = generateStatus('#0D1B3E')
    expect(hexToHsl(s.success).h).toBeGreaterThan(90)   // grün-range
    expect(hexToHsl(s.success).h).toBeLessThan(180)
    expect(hexToHsl(s.warning).h).toBeGreaterThan(20)   // gelb/orange
    expect(hexToHsl(s.warning).h).toBeLessThan(70)
    expect(hexToHsl(s.danger).h).toBeLessThan(20)       // rot
    expect(hexToHsl(s.info).h).toBeGreaterThan(180)     // blau
    expect(hexToHsl(s.info).h).toBeLessThan(260)
  })

  it('harmonizes saturation with primary saturation', () => {
    const low = generateStatus('#6B7280')  // gedämpft (Saturation <10)
    const high = generateStatus('#FF0000') // voll saturiert
    // Die HAUPT-Status-Farben bleiben im sinnvollen Korridor (~55-85%), mit kleiner
    // Rundungs-Toleranz aus dem HSL↔RGB-Roundtrip. Die *Soft-Varianten (PR #1012)
    // sind absichtlich blass (sat ~12% für Background-Pillen) → separat geprüft.
    const mainColors = (s: ReturnType<typeof generateStatus>) => [s.success, s.warning, s.danger, s.info]
    for (const hex of [...mainColors(low), ...mainColors(high)]) {
      const sat = hexToHsl(hex).s
      expect(sat).toBeGreaterThanOrEqual(54)
      expect(sat).toBeLessThanOrEqual(86)
    }
    // Soft-Varianten sind bewusst entsättigt.
    for (const hex of [low.successSoft, low.warningSoft, low.dangerSoft]) {
      expect(hexToHsl(hex).s).toBeLessThan(40)
    }
  })
})

describe('ensureContrastSafe', () => {
  it('returns true for Claimondo default', () => {
    expect(ensureContrastSafe(CLAIMONDO_DEFAULT_THEME)).toBe(true)
  })

  it('returns true for generated Navy-Theme', () => {
    const theme = generateTheme('#0D1B3E')
    expect(theme.contrastSafe).toBe(true)
  })

  it('returns false for unreadable Neon-Gelb on weißem Text', () => {
    // Forcierter Worst-Case: Primary Neon-Gelb + textOnPrimary Weiß
    const unsafe = {
      primary: '#FFFF00',
      textOnPrimary: '#FFFFFF',
      sidebarBg: '#FFFF00',
      sidebarText: '#FFFFFF',
      accent: '#FFFF00',
      textOnAccent: '#FFFFFF',
      background: '#FFFFFF',
      textPrimary: '#FFFFFF',
    }
    expect(ensureContrastSafe(unsafe)).toBe(false)
  })
})

describe('themeFromLegacy', () => {
  it('returns Claimondo default when primary is null', () => {
    const t = themeFromLegacy(null, null)
    expect(t).toEqual(CLAIMONDO_DEFAULT_THEME)
  })

  it('generates V2 theme from single primary', () => {
    const t = themeFromLegacy('#C41E3A', null)
    for (const k of V2_KEYS) expect(t[k]).toBeDefined()
    expect(t.primary).toBe('#C41E3A')
  })

  it('respects manual secondary override and derives its variants', () => {
    const t = themeFromLegacy('#C41E3A', '#0000FF')
    expect(t.secondary).toBe('#0000FF')
    expect(t.secondaryHover).not.toBe(t.secondary)
    expect(t.secondarySoft).not.toBe(t.secondary)
  })
})

describe('hydrateTheme', () => {
  it('upgrades a V1-shaped stored record to V2', () => {
    const v1: Record<string, string> = {
      primary: '#C41E3A',
      secondary: '#8B1528',
      accent: '#E8354F',
      sidebarBg: '#1A0A0E',
      textOnPrimary: '#FFFFFF',
      surface: '#FFF5F7',
    }
    const hydrated = hydrateTheme(v1, null, null)
    expect(hydrated.version).toBe(2)
    for (const k of V2_KEYS) expect(hydrated[k]).toBeDefined()
    // Stored V1-Keys bleiben erhalten
    expect(hydrated.primary).toBe('#C41E3A')
    expect(hydrated.accent).toBe('#E8354F')
  })

  it('falls back to legacy when stored is null', () => {
    const hydrated = hydrateTheme(null, '#C41E3A', null)
    expect(hydrated.primary).toBe('#C41E3A')
    expect(hydrated.version).toBe(2)
  })

  it('falls back to Claimondo default when all inputs null', () => {
    const hydrated = hydrateTheme(null, null, null)
    expect(hydrated).toEqual(CLAIMONDO_DEFAULT_THEME)
  })
})
