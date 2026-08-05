import { describe, it, expect } from 'vitest'
import { istOffenerTerminStatus, TERMINAL_TERMIN_STATUS, leadAnkerOrExpr } from '../uebernehme-lead-termine'

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

describe('leadAnkerOrExpr', () => {
  it('matcht bezug-native lead-Termine UND nur bezug-freie legacy-Termine', () => {
    expect(leadAnkerOrExpr('L-1')).toBe('and(bezug_typ.eq.lead,bezug_id.eq.L-1),and(bezug_typ.is.null,lead_id.eq.L-1)')
  })
  it('ist strenger als bezugOrExpr(lead): kein ungegateter lead_id-Zweig', () => {
    expect(leadAnkerOrExpr('L-1')).not.toContain('),lead_id.eq.')
    expect(leadAnkerOrExpr('L-1')).toContain('bezug_typ.is.null')
  })
})
