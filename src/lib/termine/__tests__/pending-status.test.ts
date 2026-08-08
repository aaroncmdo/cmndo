import { describe, it, expect } from 'vitest'
import { PENDING_TERMIN_STATUS, istPendingTerminStatus } from '../pending-status'

describe('pending-status (T4)', () => {
  it('enthält genau dispatch_pending + sv_gesucht', () => {
    expect([...PENDING_TERMIN_STATUS]).toEqual(['dispatch_pending', 'sv_gesucht'])
  })
  it('istPendingTerminStatus erkennt beide Pending-Status', () => {
    expect(istPendingTerminStatus('dispatch_pending')).toBe(true)
    expect(istPendingTerminStatus('sv_gesucht')).toBe(true)
  })
  it('istPendingTerminStatus ist false für aktive/terminale Status', () => {
    expect(istPendingTerminStatus('bestaetigt')).toBe(false)
    expect(istPendingTerminStatus('reserviert')).toBe(false)
    expect(istPendingTerminStatus('storniert')).toBe(false)
  })
  it('istPendingTerminStatus ist null-safe', () => {
    expect(istPendingTerminStatus(null)).toBe(false)
    expect(istPendingTerminStatus(undefined)).toBe(false)
  })
})
