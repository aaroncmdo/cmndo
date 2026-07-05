import { describe, it, expect } from 'vitest'
import { verdichteWochenReport, type MaklerWochenReportRoh } from '../wochenreport'

const LEER: MaklerWochenReportRoh = {
  neueLeads: 0,
  neueVermittlungen: 0,
  neueVermittlungenSumme: 0,
  offeneLeads: 0,
  freigegebenAnzahl: 0,
  freigegebenSumme: 0,
  settledCount: 0,
  staffelStufen: [],
}

describe('verdichteWochenReport', () => {
  it('ueberspringt komplett dormante Makler (alles 0) → null', () => {
    expect(verdichteWochenReport(LEER)).toBeNull()
  })

  it('sendet bei neuen Leads in der Woche', () => {
    const r = verdichteWochenReport({ ...LEER, neueLeads: 2 })
    expect(r).not.toBeNull()
    expect(r!.neueLeads).toBe(2)
  })

  it('sendet bei neuen Vermittlungen (auch ohne neue Leads)', () => {
    const r = verdichteWochenReport({ ...LEER, neueVermittlungen: 1, neueVermittlungenSumme: 150 })
    expect(r).not.toBeNull()
    expect(r!.neueVermittlungen).toBe(1)
    expect(r!.neueVermittlungenSumme).toBe(150)
  })

  it('sendet bei offener Pipeline auch bei ruhiger Woche (Nudge)', () => {
    expect(verdichteWochenReport({ ...LEER, offeneLeads: 3 })).not.toBeNull()
  })

  it('sendet wenn abrechenbare (freigegebene) Provision offen ist', () => {
    const r = verdichteWochenReport({ ...LEER, freigegebenAnzahl: 1, freigegebenSumme: 150 })
    expect(r).not.toBeNull()
    expect(r!.freigegebenSumme).toBe(150)
  })

  it('ohne konfigurierte Stufen → staffel = null (keine Staffel-Sektion)', () => {
    const r = verdichteWochenReport({ ...LEER, neueLeads: 1, staffelStufen: [] })
    expect(r!.staffel).toBeNull()
  })

  it('mit Stufen → Staffel-Fortschritt korrekt berechnet', () => {
    const r = verdichteWochenReport({
      ...LEER,
      neueLeads: 1,
      settledCount: 3,
      staffelStufen: [{ schwelle: 5, bonus_betrag_netto: 100 }],
    })
    expect(r!.staffel).not.toBeNull()
    expect(r!.staffel!.naechste?.schwelle).toBe(5)
    expect(r!.staffel!.prozent).toBeCloseTo(60) // 3 von 5
  })

  it('reicht alle Roh-Kennzahlen unveraendert durch', () => {
    const r = verdichteWochenReport({
      neueLeads: 4,
      neueVermittlungen: 2,
      neueVermittlungenSumme: 300,
      offeneLeads: 5,
      freigegebenAnzahl: 3,
      freigegebenSumme: 450,
      settledCount: 6,
      staffelStufen: [],
    })
    expect(r).toMatchObject({
      neueLeads: 4,
      neueVermittlungen: 2,
      neueVermittlungenSumme: 300,
      offeneLeads: 5,
      freigegebenAnzahl: 3,
      freigegebenSumme: 450,
      settledCount: 6,
    })
  })
})
