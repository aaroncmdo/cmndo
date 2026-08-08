import { describe, it, expect } from 'vitest'
import { buildDedupKey } from './outbox'

describe('buildDedupKey', () => {
  it('baut <template>:<claimId> ohne optionale Teile', () => {
    expect(buildDedupKey({ template: 'termin_bestaetigt', claimId: 'c1' })).toBe('termin_bestaetigt:c1')
  })

  it('haengt empfaenger + fenster deterministisch an', () => {
    expect(
      buildDedupKey({ template: 'reminder', claimId: 'c1', empfaenger: 'kunde', fenster: '2026-08-05' }),
    ).toBe('reminder:c1:kunde:2026-08-05')
  })

  it('ignoriert leere/undefined optionale Teile', () => {
    expect(buildDedupKey({ template: 't', claimId: 'x', empfaenger: '' })).toBe('t:x')
  })

  it('ist stabil bei gleichem Input (doppeltes enqueue -> gleicher Key)', () => {
    expect(buildDedupKey({ template: 't', claimId: 'x' })).toBe(buildDedupKey({ template: 't', claimId: 'x' }))
  })
})
