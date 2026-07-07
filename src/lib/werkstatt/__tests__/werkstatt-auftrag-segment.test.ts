import { describe, it, expect } from 'vitest'
import {
  werkstattAuftragSegment,
  abrechnungswegLabel,
  zeigtGutachten,
  zaehleSegmente,
} from '../werkstatt-auftrag-segment'

describe('werkstattAuftragSegment', () => {
  it('reparateur + beide -> reparatur', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'reparateur', reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
    expect(werkstattAuftragSegment({ meine_rolle: 'beide', reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
  })
  it('vermittler -> vermittlung', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'vermittler', reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
  it('null (staff) -> Fallback auf reparatur_werkstatt_id', () => {
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
})

describe('abrechnungswegLabel', () => {
  it('mappt die 3 Werte + null', () => {
    expect(abrechnungswegLabel('selbstzahler')).toBe('Selbstzahler')
    expect(abrechnungswegLabel('haftpflicht')).toBe('Haftpflicht')
    expect(abrechnungswegLabel('kasko')).toBe('Kasko')
    expect(abrechnungswegLabel(null)).toBeNull()
    expect(abrechnungswegLabel('unbekannt')).toBeNull()
  })
})

describe('zeigtGutachten', () => {
  it('nur bei Versicherung (haftpflicht/kasko)', () => {
    expect(zeigtGutachten('haftpflicht')).toBe(true)
    expect(zeigtGutachten('kasko')).toBe(true)
    expect(zeigtGutachten('selbstzahler')).toBe(false)
    expect(zeigtGutachten(null)).toBe(false)
  })
})

describe('zaehleSegmente', () => {
  it('zaehlt pro Segment', () => {
    const rows = [
      { meine_rolle: 'reparateur', reparatur_werkstatt_id: 'w1' },
      { meine_rolle: 'beide', reparatur_werkstatt_id: 'w1' },
      { meine_rolle: 'vermittler', reparatur_werkstatt_id: null },
    ]
    expect(zaehleSegmente(rows)).toEqual({ reparatur: 2, vermittlung: 1 })
  })
})
