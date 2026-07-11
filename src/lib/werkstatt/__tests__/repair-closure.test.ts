import { describe, it, expect } from 'vitest'
import { istReparaturClaimAbschliessbar, REPARATUR_CLOSE_STATUS, REPARATUR_CLOSE_GRUND } from '../repair-closure'

describe('istReparaturClaimAbschliessbar', () => {
  it('bestätigter Termin + offener Claim -> true', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'bestaetigt' })).toBe(true)
  })
  it('Termin noch angefragt -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'angefragt' })).toBe(false)
  })
  it('bereits erledigt -> false (idempotent)', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'ersterfassung' }, { status: 'erledigt' })).toBe(false)
  })
  it('Claim bereits abgeschlossen -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'abgeschlossen' }, { status: 'bestaetigt' })).toBe(false)
  })
  it('Claim storniert -> false', () => {
    expect(istReparaturClaimAbschliessbar({ operative_status: 'storniert' }, { status: 'bestaetigt' })).toBe(false)
  })
  it('Konstanten', () => {
    expect(REPARATUR_CLOSE_STATUS).toBe('abgeschlossen')
    expect(REPARATUR_CLOSE_GRUND).toBe('reparatur_erledigt')
  })
})
