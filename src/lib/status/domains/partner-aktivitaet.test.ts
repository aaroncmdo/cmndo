import { describe, it, expect } from 'vitest'
import { statusBadgeView } from '../resolve'
import { PARTNER_AKTIVITAET_DEFS } from './partner-aktivitaet'
import { PARTNER_AKTIVITAET_TYPEN } from '@/lib/partner/aktivitaet-types'

describe('partner-aktivitaet domain', () => {
  it('has a def for every activity typ (registry parity)', () => {
    for (const typ of PARTNER_AKTIVITAET_TYPEN) {
      expect(PARTNER_AKTIVITAET_DEFS[typ], `missing def: ${typ}`).toBeDefined()
    }
  })
  it('resolves label + slotClass via the registry', () => {
    const v = statusBadgeView('partner-aktivitaet', 'freigeschaltet')
    expect(v.label).toBe('Freigeschaltet')
    expect(v.slotClass).toBe('bg-success-soft text-success-strong')
  })
  it('maps danger for gesperrt and neutral for notiz', () => {
    expect(statusBadgeView('partner-aktivitaet', 'gesperrt').slotClass).toBe('bg-danger-soft text-danger-strong')
    expect(statusBadgeView('partner-aktivitaet', 'notiz').slotClass).toBe('bg-claimondo-bg text-claimondo-ondo')
  })
})
