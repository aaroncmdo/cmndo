import { describe, it, expect } from 'vitest'
import { bezugOrExpr } from './bezug-filter'

// P3.3: bezugOrExpr baut den PostgREST-or-Ausdruck, der Legacy-Achse ODER bezug-native Achse
// matcht (Superset des naiven .eq). Reiner String-Builder -> deterministisch pruefbar.
describe('bezugOrExpr (P3.3 Legacy-Retire)', () => {
  it('fall: Legacy fall_id ODER bezug-nativ (bezug_typ=fall + bezug_id)', () => {
    expect(bezugOrExpr('fall', 'a1b2c3')).toBe(
      'fall_id.eq.a1b2c3,and(bezug_typ.eq.fall,bezug_id.eq.a1b2c3)',
    )
  })
  it('lead', () => {
    expect(bezugOrExpr('lead', 'L-9')).toBe('lead_id.eq.L-9,and(bezug_typ.eq.lead,bezug_id.eq.L-9)')
  })
  it('claim', () => {
    expect(bezugOrExpr('claim', 'C-7')).toBe(
      'claim_id.eq.C-7,and(bezug_typ.eq.claim,bezug_id.eq.C-7)',
    )
  })
  it('gleiche id steht in beiden Zweigen (Legacy + bezug)', () => {
    const id = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713'
    const expr = bezugOrExpr('fall', id)
    expect(expr).toContain(`fall_id.eq.${id}`)
    expect(expr).toContain(`bezug_id.eq.${id}`)
    expect(expr).toContain('bezug_typ.eq.fall')
  })
})
