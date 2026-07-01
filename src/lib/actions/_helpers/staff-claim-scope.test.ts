import { describe, it, expect } from 'vitest'
import { staffMayMutateClaim } from './staff-claim-scope'

// Write-Path-Audit 2026-07-01, F6: admin/dispatch global; KB nur eigene/unassigned Claims.
describe('staffMayMutateClaim — F6', () => {
  it('admin darf immer (auch fremder Claim)', () => {
    expect(staffMayMutateClaim({ rolle: 'admin', claimKbId: 'other', userId: 'u1' })).toBe(true)
  })
  it('dispatch darf immer (Routing-Rolle)', () => {
    expect(staffMayMutateClaim({ rolle: 'dispatch', claimKbId: 'other', userId: 'u1' })).toBe(true)
  })
  it('KB darf eigenen Claim', () => {
    expect(staffMayMutateClaim({ rolle: 'kundenbetreuer', claimKbId: 'u1', userId: 'u1' })).toBe(true)
  })
  it('KB darf unassigned Claim (kundenbetreuer_id NULL)', () => {
    expect(staffMayMutateClaim({ rolle: 'kundenbetreuer', claimKbId: null, userId: 'u1' })).toBe(true)
  })
  it('KB darf NICHT fremden Claim', () => {
    expect(staffMayMutateClaim({ rolle: 'kundenbetreuer', claimKbId: 'other', userId: 'u1' })).toBe(false)
  })
  it('nicht-Staff-Rollen nie', () => {
    for (const rolle of ['kunde', 'makler', 'werkstatt', 'sachverstaendiger', null, undefined]) {
      expect(staffMayMutateClaim({ rolle, claimKbId: null, userId: 'u1' })).toBe(false)
    }
  })
})
