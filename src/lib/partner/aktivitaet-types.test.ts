import { describe, it, expect } from 'vitest'
import { PARTNER_AKTIVITAET_TYPEN, PARTNER_AKTIVITAET_MANUELL } from './aktivitaet-types'

describe('aktivitaet-types', () => {
  it('lists all 12 activity types incl. system events', () => {
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('notiz')
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('freigeschaltet')
    expect(PARTNER_AKTIVITAET_TYPEN).toContain('statuswechsel')
    expect(PARTNER_AKTIVITAET_TYPEN.length).toBe(12)
  })
  it('manual types are a strict subset (no system events)', () => {
    for (const t of PARTNER_AKTIVITAET_MANUELL) {
      expect(PARTNER_AKTIVITAET_TYPEN).toContain(t)
    }
    expect(PARTNER_AKTIVITAET_MANUELL).not.toContain('freigeschaltet')
  })
})
