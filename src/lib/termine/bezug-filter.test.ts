import { describe, it, expect } from 'vitest'
import { bezugOrExpr, bezugInExpr, bezugOrExprKonversion } from './bezug-filter'

// P3.3: bezugOrExpr baut den PostgREST-or-Ausdruck, der Legacy-Achse ODER bezug-native Achse
// matcht (Superset des naiven .eq). Reiner String-Builder -> deterministisch pruefbar.
// Wichtig: 'fall' und 'claim' sind Aequivalenzklasse (claim-first).
describe('bezugOrExpr (P3.3 Legacy-Retire)', () => {
  it('fall: Legacy fall_id ODER bezug-nativ (bezug_typ.in.(fall,claim) + bezug_id)', () => {
    expect(bezugOrExpr('fall', 'a1b2c3')).toBe(
      'fall_id.eq.a1b2c3,and(bezug_typ.in.(fall,claim),bezug_id.eq.a1b2c3)',
    )
  })
  it('lead: streng (nicht aequivalent zu claim)', () => {
    expect(bezugOrExpr('lead', 'L-9')).toBe('lead_id.eq.L-9,and(bezug_typ.eq.lead,bezug_id.eq.L-9)')
  })
  it('claim: identisch zu fall-Set (bezug_typ.in.(fall,claim))', () => {
    expect(bezugOrExpr('claim', 'C-7')).toBe(
      'claim_id.eq.C-7,and(bezug_typ.in.(fall,claim),bezug_id.eq.C-7)',
    )
  })
  it('gleiche id steht in beiden Zweigen (Legacy + bezug)', () => {
    const id = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713'
    const expr = bezugOrExpr('fall', id)
    expect(expr).toContain(`fall_id.eq.${id}`)
    expect(expr).toContain(`bezug_id.eq.${id}`)
    expect(expr).toContain('bezug_typ.in.(fall,claim)')
  })
  it('fall vs lead: unterschiedliche bezug_typ-Muster', () => {
    const fallExpr = bezugOrExpr('fall', 'F-1')
    const leadExpr = bezugOrExpr('lead', 'L-1')
    expect(fallExpr).toContain('bezug_typ.in.(fall,claim)')
    expect(leadExpr).toContain('bezug_typ.eq.lead')
    expect(leadExpr).not.toContain('in.(fall,claim)')
  })
})

// P3.3 .in-Variante: bezugInExpr ersetzt `.in('${achse}_id', ids)` (ID-Liste). Superset via
// col.in.(…) in beiden Zweigen. Syntax prod-verifiziert 17.07. (kein Guard bei leerer Liste).
// fall/claim: Aequivalenzklasse.
describe('bezugInExpr (P3.3 .in-Superset)', () => {
  it('fall: .in(fall_id) ODER bezug-nativ (bezug_typ.in.(fall,claim) + bezug_id.in)', () => {
    expect(bezugInExpr('fall', ['a', 'b'])).toBe(
      'fall_id.in.(a,b),and(bezug_typ.in.(fall,claim),bezug_id.in.(a,b))',
    )
  })
  it('lead (eine id): streng', () => {
    expect(bezugInExpr('lead', ['L1'])).toBe('lead_id.in.(L1),and(bezug_typ.eq.lead,bezug_id.in.(L1))')
  })
  it('claim (mehrere ids): identisch zu fall-Set', () => {
    expect(bezugInExpr('claim', ['c1', 'c2', 'c3'])).toBe(
      'claim_id.in.(c1,c2,c3),and(bezug_typ.in.(fall,claim),bezug_id.in.(c1,c2,c3))',
    )
  })
  it('leere Liste → in.() (matcht nichts, kein Error — prod-verifiziert, kein Guard)', () => {
    expect(bezugInExpr('fall', [])).toBe('fall_id.in.(),and(bezug_typ.in.(fall,claim),bezug_id.in.())')
  })
})

// Konversions-Race (Prod-Regression 07.08., Marker audit-signsa-termin-bestaetigung-bezug-
// fall-regression): signSAandCreateFall bestaetigt den Self-Service-Termin NACH
// convertLeadToClaim — dessen uebernehmeLeadTermine (T1, PR #5012) haengt den Termin dort
// bereits auf bezug ('fall', claimId) um und nullt lead_id. Ein reiner lead-Anker-Filter
// matcht danach 0 Rows -> Termin blieb 'reserviert' -> TTL-Sweep stornierte ihn.
// bezugOrExprKonversion deckt BEIDE Seiten der Konversion ab (lead-Anker fuer den Fall,
// dass das non-fatale Umhaengen fehlschlug, + fall/claim-Anker fuer den Normalfall).
describe('bezugOrExprKonversion (SA-Confirm ueber die Lead→Claim-Konversion)', () => {
  it('matcht den lead-Anker (Umhaengen fehlgeschlagen / Legacy lead_id)', () => {
    const expr = bezugOrExprKonversion('L-1', 'C-1')
    expect(expr).toContain('lead_id.eq.L-1')
    expect(expr).toContain('and(bezug_typ.eq.lead,bezug_id.eq.L-1)')
  })
  it('matcht den umgehaengten Termin (bezug fall/claim + Legacy fall_id)', () => {
    const expr = bezugOrExprKonversion('L-1', 'C-1')
    expect(expr).toContain('fall_id.eq.C-1')
    expect(expr).toContain('and(bezug_typ.in.(fall,claim),bezug_id.eq.C-1)')
  })
  it('ist exakt die Komposition beider bezugOrExpr-Achsen (lead, dann fall)', () => {
    expect(bezugOrExprKonversion('L-1', 'C-1')).toBe(
      'lead_id.eq.L-1,and(bezug_typ.eq.lead,bezug_id.eq.L-1),fall_id.eq.C-1,and(bezug_typ.in.(fall,claim),bezug_id.eq.C-1)',
    )
  })
})
