import { describe, it, expect } from 'vitest'
import { bezugOrExpr, bezugInExpr } from './bezug-filter'

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

// P3.3 .in-Variante: bezugInExpr ersetzt `.in('${achse}_id', ids)` (ID-Liste). Superset via
// col.in.(…) in beiden Zweigen. Syntax prod-verifiziert 17.07. (kein Guard bei leerer Liste).
describe('bezugInExpr (P3.3 .in-Superset)', () => {
  it('fall: .in(fall_id) ODER bezug-nativ (bezug_typ=fall + bezug_id.in)', () => {
    expect(bezugInExpr('fall', ['a', 'b'])).toBe(
      'fall_id.in.(a,b),and(bezug_typ.eq.fall,bezug_id.in.(a,b))',
    )
  })
  it('lead (eine id)', () => {
    expect(bezugInExpr('lead', ['L1'])).toBe('lead_id.in.(L1),and(bezug_typ.eq.lead,bezug_id.in.(L1))')
  })
  it('claim (mehrere ids)', () => {
    expect(bezugInExpr('claim', ['c1', 'c2', 'c3'])).toBe(
      'claim_id.in.(c1,c2,c3),and(bezug_typ.eq.claim,bezug_id.in.(c1,c2,c3))',
    )
  })
  it('leere Liste → in.() (matcht nichts, kein Error — prod-verifiziert, kein Guard)', () => {
    expect(bezugInExpr('fall', [])).toBe('fall_id.in.(),and(bezug_typ.eq.fall,bezug_id.in.())')
  })
})
