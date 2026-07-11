import { describe, it, expect } from 'vitest'
import { computeFit } from '../fit'

describe('computeFit (3-Zustand)', () => {
  it('leerer Bedarf -> unbekannt', () => {
    expect(computeFit(['karosserie'], [])).toBe('unbekannt')
  })
  it('null Faehigkeiten -> unbekannt (nicht "kann alles")', () => {
    expect(computeFit(null, ['lackierung'])).toBe('unbekannt')
    expect(computeFit([], ['lackierung'])).toBe('unbekannt')
  })
  it('deckt alle Gewerke -> passt', () => {
    expect(computeFit(['lackierung', 'karosserie'], ['lackierung'])).toBe('passt')
    expect(computeFit(['karosserie', 'lackierung', 'glas'], ['karosserie', 'lackierung'])).toBe('passt')
  })
  it('deckt nicht alle -> passt_nicht', () => {
    expect(computeFit(['karosserie'], ['lackierung'])).toBe('passt_nicht')
    expect(computeFit(['karosserie'], ['karosserie', 'lackierung'])).toBe('passt_nicht')
  })
})
