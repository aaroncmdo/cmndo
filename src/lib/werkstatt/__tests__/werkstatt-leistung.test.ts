import { describe, it, expect } from 'vitest'
import { berechneWerkstattLeistung, type WerkstattLeistungInput } from '../werkstatt-leistung'

// Fixer Bezugspunkt fuer aktivLetzte90Tage (deterministisch).
const JETZT = new Date('2026-07-07T12:00:00Z')

function auftrag(o: Partial<WerkstattLeistungInput> = {}): WerkstattLeistungInput {
  return {
    richtung: 'vermittelt',
    provision_betrag_netto: null,
    reparatur_termin_status: null,
    gutachten_fertiggestellt_am: null,
    gutachten_totalschaden: null,
    operative_status: null,
    besichtigung_start: null,
    reparatur_bestaetigter_termin: null,
    ...o,
  }
}

describe('berechneWerkstattLeistung', () => {
  it('leere Liste -> Nullwerte, Quote/Median null', () => {
    const r = berechneWerkstattLeistung([], JETZT)
    expect(r.gesamt).toBe(0)
    expect(r.offen).toBe(0)
    expect(r.abschlussquote).toBeNull()
    expect(r.reaktionstageMedian).toBeNull()
    expect(r.provisionGesamtNetto).toBe(0)
  })

  it('zaehlt Richtung inbound (eigene Vermittlung) vs vermittelt (Claimondo-Auftrag)', () => {
    const r = berechneWerkstattLeistung(
      [auftrag({ richtung: 'inbound' }), auftrag({ richtung: 'inbound' }), auftrag({ richtung: 'vermittelt' })],
      JETZT,
    )
    expect(r.inbound).toBe(2)
    expect(r.vermittelt).toBe(1)
    expect(r.gesamt).toBe(3)
  })

  it('klassifiziert offen/erledigt/abgelehnt via werkstattAuftragPhase + Abschlussquote', () => {
    const r = berechneWerkstattLeistung(
      [
        auftrag({ reparatur_termin_status: 'erledigt' }), // erledigt
        auftrag({ reparatur_termin_status: 'erledigt' }), // erledigt
        auftrag({ reparatur_termin_status: 'storniert' }), // abgelehnt
        auftrag({ reparatur_termin_status: 'bestaetigt' }), // offen (termin_bestaetigt)
        auftrag({}), // offen (neu)
      ],
      JETZT,
    )
    expect(r.erledigt).toBe(2)
    expect(r.abgelehnt).toBe(1)
    expect(r.offen).toBe(2)
    // Abschlussquote = erledigt / (erledigt + abgelehnt) = 2/3
    expect(r.abschlussquote).toBeCloseTo(2 / 3)
  })

  it('summiert Provision netto (null -> 0)', () => {
    const r = berechneWerkstattLeistung(
      [auftrag({ provision_betrag_netto: 150 }), auftrag({ provision_betrag_netto: null }), auftrag({ provision_betrag_netto: 200 })],
      JETZT,
    )
    expect(r.provisionGesamtNetto).toBe(350)
  })

  it('Median Reaktionszeit (Gutachten -> bestaetigter Termin); ignoriert negative + unvollstaendige', () => {
    const r = berechneWerkstattLeistung(
      [
        auftrag({ gutachten_fertiggestellt_am: '2026-06-01', reparatur_bestaetigter_termin: '2026-06-06' }), // 5
        auftrag({ gutachten_fertiggestellt_am: '2026-06-01', reparatur_bestaetigter_termin: '2026-06-04' }), // 3
        auftrag({ gutachten_fertiggestellt_am: '2026-06-01', reparatur_bestaetigter_termin: '2026-06-11' }), // 10
        auftrag({ gutachten_fertiggestellt_am: '2026-06-10', reparatur_bestaetigter_termin: '2026-06-01' }), // negativ -> ignoriert
        auftrag({ gutachten_fertiggestellt_am: null, reparatur_bestaetigter_termin: '2026-06-05' }), // unvollstaendig -> ignoriert
      ],
      JETZT,
    )
    // median(3, 5, 10) = 5
    expect(r.reaktionstageMedian).toBe(5)
  })

  it('Median gerade Anzahl = Mittel der beiden mittleren', () => {
    const r = berechneWerkstattLeistung(
      [
        auftrag({ gutachten_fertiggestellt_am: '2026-06-01', reparatur_bestaetigter_termin: '2026-06-03' }), // 2
        auftrag({ gutachten_fertiggestellt_am: '2026-06-01', reparatur_bestaetigter_termin: '2026-06-07' }), // 6
      ],
      JETZT,
    )
    // median(2, 6) = 4
    expect(r.reaktionstageMedian).toBe(4)
  })

  it('aktivLetzte90Tage zaehlt nur Besichtigung in den letzten 90 Tagen', () => {
    const r = berechneWerkstattLeistung(
      [
        auftrag({ besichtigung_start: '2026-07-01' }), // innerhalb
        auftrag({ besichtigung_start: '2026-01-01' }), // ausserhalb
        auftrag({ besichtigung_start: null }),
      ],
      JETZT,
    )
    expect(r.aktivLetzte90Tage).toBe(1)
  })
})
