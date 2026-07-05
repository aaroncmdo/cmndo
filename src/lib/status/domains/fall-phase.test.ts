// src/lib/status/domains/fall-phase.test.ts
import { describe, it, expect } from 'vitest'
import { FALL_PHASE_DEFS } from './fall-phase'
import { SUBPHASE_LABEL } from '@/lib/claims/lifecycle'

describe('FALL_PHASE_DEFS', () => {
  it('covers every ClaimSubPhase with matching label + a slot', () => {
    for (const code of Object.keys(SUBPHASE_LABEL)) {
      const def = FALL_PHASE_DEFS[code as keyof typeof FALL_PHASE_DEFS]
      expect(def, `missing def for ${code}`).toBeDefined()
      expect(def.label).toBe(SUBPHASE_LABEL[code as keyof typeof SUBPHASE_LABEL])
      expect(def.slot).toBeDefined()
    }
  })
  it('maps terminal subphases to semantic slots', () => {
    expect(FALL_PHASE_DEFS.erfolgreich_reguliert.slot).toBe('success')
    expect(FALL_PHASE_DEFS.storniert.slot).toBe('danger')
    expect(FALL_PHASE_DEFS.abgelehnt_final.slot).toBe('danger')
  })
})
