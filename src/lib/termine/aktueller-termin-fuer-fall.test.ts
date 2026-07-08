import { describe, it, expect } from 'vitest'
import { pickAktuellerTermin, type FallTerminRow } from './aktueller-termin-fuer-fall'

const NOW = new Date('2026-07-07T12:00:00Z').getTime()
function row(p: Partial<FallTerminRow> & { start_zeit: string; status: string }): FallTerminRow {
  return { id: p.id ?? 'x', end_zeit: null, assignee_id: 'sv-1', ...p }
}

describe('pickAktuellerTermin', () => {
  it('null bei keinen Zeilen', () => {
    expect(pickAktuellerTermin([], NOW)).toBeNull()
  })

  it('null wenn nur inaktive Status (abgeschlossen/abgelehnt/storniert)', () => {
    const rows = [
      row({ start_zeit: '2026-07-08T10:00:00Z', status: 'abgeschlossen' }),
      row({ start_zeit: '2026-07-09T10:00:00Z', status: 'storniert' }),
    ]
    expect(pickAktuellerTermin(rows, NOW)).toBeNull()
  })

  it('liefert den einzigen anstehenden aktiven Termin', () => {
    const rows = [row({ id: 'a', start_zeit: '2026-07-08T10:00:00Z', status: 'bestaetigt' })]
    expect(pickAktuellerTermin(rows, NOW)?.id).toBe('a')
  })

  it('bevorzugt den fruehesten anstehenden aktiven Termin', () => {
    const rows = [
      row({ id: 'spaet', start_zeit: '2026-07-10T10:00:00Z', status: 'bestaetigt' }),
      row({ id: 'frueh', start_zeit: '2026-07-08T09:00:00Z', status: 'reserviert' }),
    ]
    expect(pickAktuellerTermin(rows, NOW)?.id).toBe('frueh')
  })

  it('ignoriert vergangene Termine wenn ein anstehender existiert', () => {
    const rows = [
      row({ id: 'vergangen', start_zeit: '2026-07-05T10:00:00Z', status: 'bestaetigt' }),
      row({ id: 'anstehend', start_zeit: '2026-07-08T10:00:00Z', status: 'bestaetigt' }),
    ]
    expect(pickAktuellerTermin(rows, NOW)?.id).toBe('anstehend')
  })

  it('faellt auf den juengsten vergangenen aktiven Termin zurueck wenn keiner ansteht', () => {
    const rows = [
      row({ id: 'alt', start_zeit: '2026-07-01T10:00:00Z', status: 'bestaetigt' }),
      row({ id: 'juenger', start_zeit: '2026-07-05T10:00:00Z', status: 'verlegt' }),
    ]
    expect(pickAktuellerTermin(rows, NOW)?.id).toBe('juenger')
  })

  it('mischt Status + Zeit korrekt (inaktive raus, dann fruehester anstehender)', () => {
    const rows = [
      row({ id: 'storniert-frueh', start_zeit: '2026-07-07T13:00:00Z', status: 'storniert' }),
      row({ id: 'aktiv-spaet', start_zeit: '2026-07-09T10:00:00Z', status: 'bestaetigt' }),
      row({ id: 'aktiv-frueh', start_zeit: '2026-07-08T08:00:00Z', status: 'reserviert' }),
    ]
    expect(pickAktuellerTermin(rows, NOW)?.id).toBe('aktiv-frueh')
  })
})
