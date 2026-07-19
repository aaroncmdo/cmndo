import { describe, it, expect } from 'vitest'
import { basisTypVonGutachterTermin, TERMIN_TYP_META } from './termin-typ'

describe('basisTypVonGutachterTermin', () => {
  it('mappt sv_begutachtung -> besichtigung', () => {
    expect(basisTypVonGutachterTermin('sv_begutachtung')).toBe('besichtigung')
  })
  it('mappt kb_beratung -> beratung', () => {
    expect(basisTypVonGutachterTermin('kb_beratung')).toBe('beratung')
  })
  it('mappt konfrontation -> konfrontation', () => {
    expect(basisTypVonGutachterTermin('konfrontation')).toBe('konfrontation')
  })
  it('faellt bei null/unbekannt auf besichtigung zurueck', () => {
    expect(basisTypVonGutachterTermin(null)).toBe('besichtigung')
    expect(basisTypVonGutachterTermin('foo')).toBe('besichtigung')
  })
})

describe('TERMIN_TYP_META', () => {
  it('hat einen Eintrag fuer jeden Typ', () => {
    for (const t of ['besichtigung', 'nachbesichtigung', 'reparatur', 'beratung', 'konfrontation'] as const) {
      expect(TERMIN_TYP_META[t]).toBeTruthy()
      expect(typeof TERMIN_TYP_META[t].labelKey).toBe('string')
    }
  })
})
