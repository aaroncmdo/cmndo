import { describe, it, expect } from 'vitest'
import { werkstattAuftragSegment, kvaStatus, kvaStatusLabel } from './werkstatt-auftrag-segment'

describe('werkstattAuftragSegment', () => {
  it('reparateur -> reparatur', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'reparateur', reparatur_werkstatt_id: null })).toBe('reparatur')
  })
  it('beide -> reparatur', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'beide', reparatur_werkstatt_id: null })).toBe('reparatur')
  })
  it('vermittler -> vermittlung', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'vermittler', reparatur_werkstatt_id: 'ws-1' })).toBe('vermittlung')
  })
  it('Fallback (NULL rolle) + reparatur_werkstatt_id -> reparatur', () => {
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: 'ws-1' })).toBe('reparatur')
  })
  it('Fallback (NULL rolle) ohne reparatur_werkstatt_id -> vermittlung', () => {
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
})

describe('kvaStatus', () => {
  const base = {
    meine_rolle: 'reparateur' as string | null,
    reparatur_werkstatt_id: 'ws-1' as string | null,
    abrechnungsweg: 'selbstzahler' as string | null,
    reparatur_freigegeben_am: null as string | null,
    kostenvoranschlag_netto: null as number | null,
    kostenvoranschlag_brutto: null as number | null,
  }

  it('Vermittler -> null (KVA nur im Reparatur-Segment)', () => {
    expect(kvaStatus({ ...base, meine_rolle: 'vermittler', reparatur_werkstatt_id: null })).toBeNull()
  })

  it('Reparateur + Haftpflicht -> null (SV-Gutachten-Route, kein KVA)', () => {
    expect(kvaStatus({ ...base, abrechnungsweg: 'haftpflicht' })).toBeNull()
  })

  it('Reparateur + Kasko -> "benoetigt" (Werkstatt-Reparatur-Route)', () => {
    expect(kvaStatus({ ...base, abrechnungsweg: 'kasko' })).toBe('benoetigt')
  })

  it('Reparateur + freigegeben -> "freigegeben"', () => {
    expect(kvaStatus({ ...base, reparatur_freigegeben_am: '2026-07-05T09:00:00Z' })).toBe('freigegeben')
  })

  it('Reparateur + kostenvoranschlag_brutto gesetzt -> "erstellt"', () => {
    expect(kvaStatus({ ...base, kostenvoranschlag_brutto: 2380 })).toBe('erstellt')
  })

  it('Reparateur + nichts -> "benoetigt"', () => {
    expect(kvaStatus(base)).toBe('benoetigt')
  })
})

describe('kvaStatusLabel', () => {
  it('mappt alle Status auf DE-Labels', () => {
    expect(kvaStatusLabel('benoetigt')).toBe('KVA benötigt')
    expect(kvaStatusLabel('erstellt')).toBe('KVA erstellt')
    expect(kvaStatusLabel('freigegeben')).toBe('KVA freigegeben')
  })
})
