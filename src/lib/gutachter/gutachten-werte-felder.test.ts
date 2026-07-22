import { describe, it, expect } from 'vitest'
import { filterWerteFelder, SV_WERTE_FELDER } from './gutachten-werte-felder'

describe('filterWerteFelder', () => {
  it('lässt nur Whitelist-Felder durch', () => {
    const out = filterWerteFelder({ minderwert: 500, status: 'x', claim_id: 'y' })
    expect(out).toEqual({ minderwert: 500 })
  })
  it('mappt leeren String auf null (Feld löschen)', () => {
    expect(filterWerteFelder({ restwert: '' })).toEqual({ restwert: null })
  })
  it('lässt boolean totalschaden zu', () => {
    expect(filterWerteFelder({ totalschaden: true })).toEqual({ totalschaden: true })
  })
  it('SV_WERTE_FELDER enthält die 5 Kernwerte + totalschaden', () => {
    const keys = SV_WERTE_FELDER.map((f) => f.key)
    for (const k of [
      'reparaturkosten_netto',
      'reparaturkosten_brutto',
      'minderwert',
      'wiederbeschaffungswert',
      'restwert',
      'totalschaden',
    ]) {
      expect(keys).toContain(k)
    }
  })
})
