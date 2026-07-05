import { describe, it, expect } from 'vitest'
import { aggregierePipeline } from '../pipeline'

describe('aggregierePipeline', () => {
  it('leere Liste → alles 0', () => {
    expect(aggregierePipeline([])).toEqual({
      vermittelt: 0,
      pendingAnzahl: 0,
      abrechenbarAnzahl: 0,
      abrechenbarSumme: 0,
      ausgezahltAnzahl: 0,
      ausgezahltSumme: 0,
    })
  })

  it('ignoriert storniert komplett (keine Vermittlung)', () => {
    const p = aggregierePipeline([{ status: 'storniert', betrag_netto_eur: 150 }])
    expect(p.vermittelt).toBe(0)
    expect(p.abrechenbarSumme).toBe(0)
  })

  it('pending zaehlt als Vermittlung, aber kein abrechenbares Geld', () => {
    const p = aggregierePipeline([{ status: 'pending', betrag_netto_eur: 150 }])
    expect(p.vermittelt).toBe(1)
    expect(p.pendingAnzahl).toBe(1)
    expect(p.abrechenbarSumme).toBe(0)
    expect(p.ausgezahltSumme).toBe(0)
  })

  it('freigegeben → abrechenbar (Anzahl + Summe)', () => {
    const p = aggregierePipeline([
      { status: 'freigegeben', betrag_netto_eur: 150 },
      { status: 'freigegeben', betrag_netto_eur: '100' },
    ])
    expect(p.abrechenbarAnzahl).toBe(2)
    expect(p.abrechenbarSumme).toBe(250)
    expect(p.vermittelt).toBe(2)
  })

  it('ausgezahlt → ausgezahlt (Anzahl + Summe)', () => {
    const p = aggregierePipeline([{ status: 'ausgezahlt', betrag_netto_eur: 200 }])
    expect(p.ausgezahltAnzahl).toBe(1)
    expect(p.ausgezahltSumme).toBe(200)
    expect(p.vermittelt).toBe(1)
  })

  it('gemischter Funnel: Buckets + Summen korrekt, storniert raus', () => {
    const p = aggregierePipeline([
      { status: 'pending', betrag_netto_eur: 150 },
      { status: 'freigegeben', betrag_netto_eur: 150 },
      { status: 'freigegeben', betrag_netto_eur: 150 },
      { status: 'ausgezahlt', betrag_netto_eur: 300 },
      { status: 'storniert', betrag_netto_eur: 150 },
    ])
    expect(p.vermittelt).toBe(4) // 5 minus storniert
    expect(p.pendingAnzahl).toBe(1)
    expect(p.abrechenbarAnzahl).toBe(2)
    expect(p.abrechenbarSumme).toBe(300)
    expect(p.ausgezahltAnzahl).toBe(1)
    expect(p.ausgezahltSumme).toBe(300)
  })
})
