import { describe, it, expect } from 'vitest'
import { brandLibrary } from './registry'

describe('brandLibrary.find', () => {
  it('mappt bekannte Tags auf Marken-Keys', () => {
    expect(brandLibrary.find(['warndreieck'])).toBe('warndreieck')
    expect(brandLibrary.find(['triangle'])).toBe('warndreieck')
    expect(brandLibrary.find(['kennzeichen'])).toBe('kennzeichen')
    expect(brandLibrary.find(['license-plate'])).toBe('kennzeichen')
  })

  it('ist case-insensitive und nimmt den ersten Treffer', () => {
    expect(brandLibrary.find(['Foo', 'Warndreieck'])).toBe('warndreieck')
  })

  it('liefert null fuer unbekannte Tags', () => {
    expect(brandLibrary.find(['unbekannt', 'xyz'])).toBeNull()
  })
})
