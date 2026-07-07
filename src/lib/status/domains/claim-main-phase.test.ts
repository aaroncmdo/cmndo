import { describe, it, expect } from 'vitest'
import { CLAIM_MAIN_PHASE_DEFS } from './claim-main-phase'
import { MAIN_PHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'

const PHASES: ClaimMainPhase[] = ['erfassung', 'begutachtung', 'regulierung', 'abschluss']
const VALID_SLOTS = new Set(['neutral', 'active', 'pending', 'done', 'success', 'warning', 'danger'])

describe('claim-main-phase domain', () => {
  it('deckt genau die 4 Hauptphasen ab', () => {
    for (const p of PHASES) expect(CLAIM_MAIN_PHASE_DEFS[p]).toBeDefined()
    expect(Object.keys(CLAIM_MAIN_PHASE_DEFS).sort()).toEqual([...PHASES].sort())
  })
  it('Label kommt aus lifecycle MAIN_PHASE_LABEL (SSoT, keine Duplikation)', () => {
    for (const p of PHASES) expect(CLAIM_MAIN_PHASE_DEFS[p].label).toBe(MAIN_PHASE_LABEL[p])
  })
  it('jeder Slot ist ein gueltiger Token-Slot', () => {
    for (const p of PHASES) expect(VALID_SLOTS.has(CLAIM_MAIN_PHASE_DEFS[p].slot!)).toBe(true)
  })
})
