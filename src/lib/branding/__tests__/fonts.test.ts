import { describe, it, expect } from 'vitest'
import {
  FONT_PAIRS,
  FONT_CATEGORY_LABELS,
  DEFAULT_FONT_PER_CATEGORY,
  CLAIMONDO_DEFAULT_FONT_PAIR_ID,
  getFontPair,
  getPairsByCategory,
  buildGoogleFontsUrl,
} from '../fonts'

// AAR-421: Font-Registry-Tests.

describe('FONT_PAIRS registry', () => {
  it('has 9 pairs total (3 per category)', () => {
    expect(Object.keys(FONT_PAIRS)).toHaveLength(9)
    expect(getPairsByCategory('racing')).toHaveLength(3)
    expect(getPairsByCategory('elegance')).toHaveLength(3)
    expect(getPairsByCategory('kanoo')).toHaveLength(3)
  })

  it('every pair has heading + body + cssStack + preview', () => {
    for (const pair of Object.values(FONT_PAIRS)) {
      expect(pair.id).toBeTruthy()
      expect(pair.category).toMatch(/^(racing|elegance|kanoo)$/)
      expect(pair.heading.family).toBeTruthy()
      expect(pair.body.family).toBeTruthy()
      expect(pair.heading.weights.length).toBeGreaterThan(0)
      expect(pair.body.weights.length).toBeGreaterThan(0)
      expect(pair.cssStack.heading).toContain(pair.heading.family)
      expect(pair.cssStack.body).toContain(pair.body.family)
      expect(pair.preview.length).toBeGreaterThan(3)
    }
  })

  it('cssStack includes system fallback', () => {
    for (const pair of Object.values(FONT_PAIRS)) {
      const hasFallback = pair.cssStack.body.includes('system') || pair.cssStack.body.includes('serif')
      expect(hasFallback, `pair ${pair.id} body-stack fallback`).toBe(true)
    }
  })
})

describe('category labels', () => {
  it('has German labels for all 3 categories', () => {
    expect(FONT_CATEGORY_LABELS.racing).toBe('Racing')
    expect(FONT_CATEGORY_LABELS.elegance).toBe('Elegance')
    expect(FONT_CATEGORY_LABELS.kanoo).toBe('Kanoo')
  })
})

describe('DEFAULT_FONT_PER_CATEGORY', () => {
  it('points at valid pair IDs', () => {
    for (const [cat, id] of Object.entries(DEFAULT_FONT_PER_CATEGORY)) {
      expect(FONT_PAIRS[id], `default for ${cat}`).toBeDefined()
      expect(FONT_PAIRS[id].category).toBe(cat)
    }
  })
})

describe('getFontPair', () => {
  it('returns correct pair for valid id', () => {
    expect(getFontPair('racing_1').category).toBe('racing')
    expect(getFontPair('elegance_2').heading.family).toBe('Cormorant Garamond')
  })

  it('falls back to Claimondo default for null/undefined', () => {
    expect(getFontPair(null).id).toBe(CLAIMONDO_DEFAULT_FONT_PAIR_ID)
    expect(getFontPair(undefined).id).toBe(CLAIMONDO_DEFAULT_FONT_PAIR_ID)
  })

  it('falls back to Claimondo default for unknown id', () => {
    expect(getFontPair('does_not_exist').id).toBe(CLAIMONDO_DEFAULT_FONT_PAIR_ID)
  })
})

describe('buildGoogleFontsUrl', () => {
  it('builds a valid CSS2 URL for a single-family pair', () => {
    const url = buildGoogleFontsUrl(FONT_PAIRS.kanoo_1)
    expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/)
    expect(url).toContain('family=Inter')
    expect(url).toContain('display=swap')
  })

  it('merges weights when heading + body share the family', () => {
    // kanoo_1 uses Inter für beide → weights 400, 500, 600, 700 zusammengeführt,
    // und nur EIN family=Inter im Query-String.
    const url = buildGoogleFontsUrl(FONT_PAIRS.kanoo_1)
    const familyMatches = url.match(/family=/g) ?? []
    expect(familyMatches).toHaveLength(1)
    expect(url).toContain('400;500;600;700')
  })

  it('includes both families when pair mixes two', () => {
    const url = buildGoogleFontsUrl(FONT_PAIRS.elegance_1)
    expect(url).toContain('Playfair%20Display')
    expect(url).toContain('Lato')
  })
})
