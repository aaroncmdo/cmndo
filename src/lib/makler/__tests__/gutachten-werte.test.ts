import { describe, it, expect } from 'vitest'
import { mapGutachtenWerte, EMPTY_GUTACHTEN_WERTE } from '../gutachten-werte'

describe('mapGutachtenWerte', () => {
  it('maps entity fields + reconstructs nutzungsausfall = tage * satz', () => {
    expect(
      mapGutachtenWerte({
        reparaturkosten_netto: 5000,
        minderwert: 1000,
        nutzungsausfall_tage: 10,
        gutachten_nutzungsausfall_tagessatz_eur: 59,
        gutachten_sv_honorar_netto: 800,
      }),
    ).toEqual({
      reparaturkosten: 5000,
      wertminderung: 1000,
      nutzungsausfall_gesamt: 590,
      gutachter_honorar: 800,
    })
  })

  it('coerces numeric strings (Entity liefert numeric als String)', () => {
    expect(mapGutachtenWerte({ reparaturkosten_netto: '2500.50', minderwert: '0' })).toMatchObject({
      reparaturkosten: 2500.5,
      wertminderung: 0,
    })
  })

  it('nutzungsausfall_gesamt null wenn Tage ODER Satz fehlt', () => {
    expect(mapGutachtenWerte({ nutzungsausfall_tage: 10 }).nutzungsausfall_gesamt).toBeNull()
    expect(mapGutachtenWerte({ gutachten_nutzungsausfall_tagessatz_eur: 59 }).nutzungsausfall_gesamt).toBeNull()
  })

  it('null/leere Zeile -> alle null', () => {
    expect(mapGutachtenWerte(null)).toEqual(EMPTY_GUTACHTEN_WERTE)
    expect(mapGutachtenWerte(undefined)).toEqual(EMPTY_GUTACHTEN_WERTE)
    expect(mapGutachtenWerte({})).toEqual(EMPTY_GUTACHTEN_WERTE)
  })
})
