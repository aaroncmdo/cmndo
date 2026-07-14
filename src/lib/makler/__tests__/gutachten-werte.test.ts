import { describe, it, expect } from 'vitest'
import { mapGutachtenWerte, mapGutachtenWerteAusClaimView, EMPTY_GUTACHTEN_WERTE } from '../gutachten-werte'

describe('mapGutachtenWerteAusClaimView', () => {
  it('liefert dieselben Werte wie der frühere v_gutachten_werte-Read (numerisch)', () => {
    expect(
      mapGutachtenWerteAusClaimView({
        reparaturkosten: 2500,
        wertminderung: 300,
        nutzungsausfall_gesamt: 590, // View rechnet Tagessatz x Tage — wie mapGutachtenWerte
        gutachter_honorar: 800,
      }),
    ).toEqual({ reparaturkosten: 2500, wertminderung: 300, nutzungsausfall_gesamt: 590, gutachter_honorar: 800 })
  })

  it('coerct numeric-as-String und behandelt fehlende Werte als null', () => {
    expect(mapGutachtenWerteAusClaimView({ reparaturkosten: '2500.50', wertminderung: null })).toMatchObject({
      reparaturkosten: 2500.5,
      wertminderung: null,
      nutzungsausfall_gesamt: null,
      gutachter_honorar: null,
    })
  })

  it('null/undefined → leere Werte', () => {
    expect(mapGutachtenWerteAusClaimView(null)).toEqual(EMPTY_GUTACHTEN_WERTE)
    expect(mapGutachtenWerteAusClaimView(undefined)).toEqual(EMPTY_GUTACHTEN_WERTE)
  })
})

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
