import { describe, it, expect } from 'vitest'
import { rowToFenster } from './belegung'
import type { VBelegungRow } from './types'

describe('rowToFenster', () => {
  it('mappt eine Buchungs-Zeile (buchung) vollständig', () => {
    const row: VBelegungRow = {
      assignee_typ: 'sachverstaendiger',
      assignee_id: 'sv-1',
      start_zeit: '2026-06-02T08:00:00Z',
      end_zeit: '2026-06-02T09:00:00Z',
      belegung_typ: 'buchung',
      status: 'bestaetigt',
      termin_typ: 'sv_begutachtung',
      bezug_typ: 'claim',
      bezug_id: 'claim-1',
      standort_lat: 51.2,
      standort_lng: 7.1,
      quelle_id: 'termin-1',
    }
    expect(rowToFenster(row)).toEqual({
      start: '2026-06-02T08:00:00Z',
      end: '2026-06-02T09:00:00Z',
      belegungTyp: 'buchung',
      status: 'bestaetigt',
      terminTyp: 'sv_begutachtung',
      bezugTyp: 'claim',
      bezugId: 'claim-1',
      standortLat: 51.2,
      standortLng: 7.1,
      quelleId: 'termin-1',
    })
  })

  it('mappt einen externen Block (extern) mit null status/bezug', () => {
    const row: VBelegungRow = {
      assignee_typ: 'sachverstaendiger',
      assignee_id: 'sv-1',
      start_zeit: '2026-06-03T10:00:00Z',
      end_zeit: '2026-06-03T11:00:00Z',
      belegung_typ: 'extern',
      status: null,
      termin_typ: null,
      bezug_typ: null,
      bezug_id: null,
      standort_lat: 51.0,
      standort_lng: 7.0,
      quelle_id: 'cache-9',
    }
    const f = rowToFenster(row)
    expect(f.belegungTyp).toBe('extern')
    expect(f.status).toBeNull()
    expect(f.bezugTyp).toBeNull()
    expect(f.bezugId).toBeNull()
    expect(f.quelleId).toBe('cache-9')
  })
})
