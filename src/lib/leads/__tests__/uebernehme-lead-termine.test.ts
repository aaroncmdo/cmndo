import { describe, it, expect } from 'vitest'
import { istOffenerTerminStatus, TERMINAL_TERMIN_STATUS } from '../uebernehme-lead-termine'

describe('istOffenerTerminStatus', () => {
  it.each(['dispatch_pending', 'sv_gesucht', 'reserviert', 'bestaetigt', 'gegenvorschlag', 'verschoben', 'verlegung_pending'])(
    'offen: %s', (s) => expect(istOffenerTerminStatus(s)).toBe(true),
  )
  it.each(['storniert', 'abgesagt', 'abgelehnt', 'abgeschlossen', 'verlegt'])(
    'terminal/superseded: %s', (s) => expect(istOffenerTerminStatus(s)).toBe(false),
  )
  it('null/leer ist nicht offen', () => {
    expect(istOffenerTerminStatus(null)).toBe(false)
    expect(istOffenerTerminStatus('')).toBe(false)
  })
  it('TERMINAL_TERMIN_STATUS ist die Exklusionsmenge', () => {
    expect([...TERMINAL_TERMIN_STATUS].sort()).toEqual(['abgelehnt', 'abgesagt', 'abgeschlossen', 'storniert', 'verlegt'])
  })
})
