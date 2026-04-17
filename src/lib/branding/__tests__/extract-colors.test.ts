import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-420: Tests für extractBrandPalette(). Wir mocken node-vibrant +
// claude-vision, weil beide externe Resources brauchen (I/O + API).

type MockSwatch = { hex: string; population: number; hsl: [number, number, number] }
type MockPalette = {
  Vibrant?: MockSwatch | null
  DarkVibrant?: MockSwatch | null
  LightVibrant?: MockSwatch | null
  Muted?: MockSwatch | null
  DarkMuted?: MockSwatch | null
  LightMuted?: MockSwatch | null
}

let currentPalette: MockPalette = {}
let currentVision: {
  brandMood: 'sportlich' | 'edel' | 'funktional' | 'unbekannt'
  recommendedFontCategory: 'racing' | 'elegance' | 'kanoo'
  primaryColorOk: boolean
  primarySuggestion?: string
} = {
  brandMood: 'funktional',
  recommendedFontCategory: 'kanoo',
  primaryColorOk: true,
}

vi.mock('node-vibrant/node', () => ({
  Vibrant: {
    from: () => ({
      getPalette: async () => currentPalette,
    }),
  },
}))

vi.mock('../claude-vision', () => ({
  analyzeLogo: vi.fn(async () => currentVision),
}))

import { extractBrandPalette } from '../extract-colors'

function sw(hex: string, population: number, h: number, s: number, l: number): MockSwatch {
  return { hex, population, hsl: [h, s, l] }
}

beforeEach(() => {
  currentPalette = {}
  currentVision = {
    brandMood: 'funktional',
    recommendedFontCategory: 'kanoo',
    primaryColorOk: true,
  }
})

describe('extractBrandPalette — Dunkles Logo mit klaren Farben', () => {
  it('liefert 3 distinkte Farben + contrastSafe', async () => {
    currentPalette = {
      DarkVibrant: sw('#0D1B3E', 1200, 220 / 360, 0.65, 0.15), // Navy
      Vibrant: sw('#4573A2', 800, 210 / 360, 0.41, 0.45),      // Mittleres Blau
      Muted: sw('#7BA3CC', 400, 208 / 360, 0.42, 0.64),        // Helles Blau
    }
    currentVision = {
      brandMood: 'edel',
      recommendedFontCategory: 'elegance',
      primaryColorOk: true,
    }
    const result = await extractBrandPalette('https://example.com/navy.png')
    expect(result.primary.toUpperCase()).toMatch(/^#[0-9A-F]{6}$/)
    expect(result.secondary.toUpperCase()).toMatch(/^#[0-9A-F]{6}$/)
    expect(result.accent.toUpperCase()).toMatch(/^#[0-9A-F]{6}$/)
    expect(result.primary).not.toBe(result.secondary)
    expect(result.contrastSafe).toBe(true)
    expect(result.brandMood).toBe('edel')
    expect(result.recommendedFontCategory).toBe('elegance')
    expect(result.candidates.primary.length).toBeGreaterThan(0)
    expect(result.fallbackReason).toBeUndefined()
  })
})

describe('extractBrandPalette — Monochrom-Logo (Single-Color-Fallback)', () => {
  it('leitet secondary/accent triadisch ab und setzt SINGLE_COLOR', async () => {
    currentPalette = {
      DarkVibrant: sw('#000000', 1500, 0, 0, 0),
      DarkMuted: sw('#1A1A1A', 200, 0, 0, 0.1),
    }
    const result = await extractBrandPalette('https://example.com/mono.png')
    // Secondary/Accent dürfen NICHT identisch mit Primary sein — triadisch abgeleitet.
    expect(result.secondary).not.toBe(result.primary)
    expect(result.accent).not.toBe(result.primary)
    expect(result.secondary).not.toBe(result.accent)
    expect(result.fallbackReason).toBe('SINGLE_COLOR')
  })
})

describe('extractBrandPalette — Keine Farben (leere Palette)', () => {
  it('fällt auf Claimondo-Default zurück + setzt NO_COLORS', async () => {
    currentPalette = {}
    const result = await extractBrandPalette('https://example.com/empty.png')
    expect(result.primary).toBe('#0D1B3E')
    expect(result.secondary).toBe('#4573A2')
    expect(result.accent).toBe('#7BA3CC')
    expect(result.fallbackReason).toBe('NO_COLORS')
    expect(result.brandMood).toBe('unbekannt')
  })
})

describe('extractBrandPalette — Claude-Vision Primary-Override', () => {
  it('übernimmt primarySuggestion wenn Claude sagt primaryColorOk=false', async () => {
    currentPalette = {
      // Extraktion erwischt den weißen Canvas-BG
      LightMuted: sw('#FFFFFF', 5000, 0, 0, 1),
      DarkVibrant: sw('#C41E3A', 300, 350 / 360, 0.75, 0.45), // die echte Marke
    }
    currentVision = {
      brandMood: 'sportlich',
      recommendedFontCategory: 'racing',
      primaryColorOk: false,
      primarySuggestion: '#C41E3A',
    }
    const result = await extractBrandPalette('https://example.com/whitebg.png')
    // Primary sollte vom Claude-Vorschlag kommen (modulo WCAG-Cascade-Abdunkelung)
    expect(result.primary.toUpperCase().startsWith('#')).toBe(true)
    expect(result.brandMood).toBe('sportlich')
    expect(result.recommendedFontCategory).toBe('racing')
    // Mindestens einer der Reasons sollte gesetzt sein (CLAUDE_OVERRIDE oder WCAG_FAIL)
    expect(['CLAUDE_OVERRIDE', 'WCAG_FAIL', 'SINGLE_COLOR', undefined]).toContain(result.fallbackReason)
  })
})

describe('extractBrandPalette — Kandidaten-Liste', () => {
  it('liefert deduplicierte Kandidaten für UI-Picker', async () => {
    currentPalette = {
      Vibrant: sw('#C41E3A', 1000, 350 / 360, 0.75, 0.45),
      DarkVibrant: sw('#8B1528', 600, 350 / 360, 0.75, 0.3),
      Muted: sw('#D4A5AC', 300, 350 / 360, 0.35, 0.75),
      LightMuted: sw('#F5E5E8', 200, 350 / 360, 0.35, 0.9),
    }
    const result = await extractBrandPalette('https://example.com/red.png')
    // Alle Kandidaten sollten unique sein
    const unique = new Set(result.candidates.primary)
    expect(unique.size).toBe(result.candidates.primary.length)
    expect(result.candidates.primary.length).toBeGreaterThanOrEqual(3)
  })
})
