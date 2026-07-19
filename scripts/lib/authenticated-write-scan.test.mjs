import { describe, it, expect } from 'vitest'
import {
  WRITE_GATE_TOKENS,
  branchIsWriteGated,
  writeExprReachable,
  rowsToWriteViolations,
  diffBaseline,
} from './authenticated-write-scan.mjs'

describe('WRITE_GATE_TOKENS', () => {
  it('enthaelt die anon-Basis + write-spezifische Scoping-/Operator-Helper', () => {
    expect(WRITE_GATE_TOKENS).toContain('auth.uid')
    expect(WRITE_GATE_TOKENS).toContain('is_admin')
    expect(WRITE_GATE_TOKENS).toContain('can_access_claim')
    expect(WRITE_GATE_TOKENS).toContain('is_kundenbetreuer')
    expect(WRITE_GATE_TOKENS).toContain('is_sv')
    expect(WRITE_GATE_TOKENS).toContain('auth_flottenmanager_firma_id')
    expect(WRITE_GATE_TOKENS).toContain('auth_user_firma_id')
  })
})

describe('branchIsWriteGated', () => {
  it('auth.uid()-Owner-Check ist gated', () => {
    expect(branchIsWriteGated('(zugewiesen_an = ( SELECT auth.uid() AS uid))')).toBe(true)
  })
  it('Firma-Scoping-Helper ist gated', () => {
    expect(branchIsWriteGated('(firma_id = ( SELECT auth_user_firma_id() AS x))')).toBe(true)
  })
  it('reiner Nicht-uid-Zweig (source IS NULL) ist NICHT gated', () => {
    expect(branchIsWriteGated('(source IS NULL)')).toBe(false)
  })
  it('KEIN anon-Anti-Pattern: auth.uid() … <spalte> IS NULL bleibt gated', () => {
    // Der Kern-Unterschied zum anon-Scanner: `kundenbetreuer_id IS NULL` nach `auth.uid()`
    // darf den Zweig NICHT ent-gaten (im anon-Fall waere `auth.uid() IS NULL` anon-oeffnend).
    const branch =
      "(( SELECT is_kundenbetreuer() AS is_kundenbetreuer) AND ((kundenbetreuer_id = ( SELECT auth.uid() AS uid)) OR (kundenbetreuer_id IS NULL)))"
    expect(branchIsWriteGated(branch)).toBe(true)
  })
})

describe('writeExprReachable', () => {
  it('true -> reachable (voll offen)', () => {
    expect(writeExprReachable('true')).toBe(true)
  })
  it('false -> NICHT reachable (Deny-Policy, z.B. ai_usage_log)', () => {
    expect(writeExprReachable('false')).toBe(false)
  })
  it('DAS ECHTE claims-Muster (is_admin OR (is_kundenbetreuer AND (id=uid OR id IS NULL))) -> NICHT reachable', () => {
    // Genau der Prod-Ausdruck von claims__b1upd_au — der anon-Scanner wuerde ihn faelschlich
    // als reachable flaggen (Anti-Pattern-Greedy auf `kundenbetreuer_id IS NULL`).
    const expr =
      "(( SELECT is_admin() AS is_admin) OR (( SELECT is_kundenbetreuer() AS is_kundenbetreuer) AND ((kundenbetreuer_id = ( SELECT auth.uid() AS uid)) OR (kundenbetreuer_id IS NULL))))"
    expect(writeExprReachable(expr)).toBe(false)
  })
  it('DAS ECHTE flotten_fahrzeuge-Muster (auth.uid OR firma_id=auth_*_firma_id()) -> NICHT reachable', () => {
    const expr =
      "((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.rolle = ANY (ARRAY['admin'::user_role, 'dispatch'::user_role]))))) OR (firma_id = ( SELECT auth_flottenmanager_firma_id() AS x)) OR (firma_id = ( SELECT auth_user_firma_id() AS y)))"
    expect(writeExprReachable(expr)).toBe(false)
  })
  it('DAS ECHTE tasks-Muster (is_admin OR (viele auth.uid/can_access_claim-Zweige mit fall_id IS NULL)) -> NICHT reachable', () => {
    const expr =
      "(( SELECT is_admin() AS is_admin) OR (((fall_id IS NOT NULL) AND can_access_claim(claim_id)) OR (zugewiesen_an = ( SELECT auth.uid() AS uid)) OR ((fall_id IS NULL) AND (lead_id IS NULL) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::user_role)))))))"
    expect(writeExprReachable(expr)).toBe(false)
  })
  it('LEGIT-BROAD: (source IS NULL) -> reachable (oeffentlicher Finder-Submit -> Baseline)', () => {
    expect(writeExprReachable('(source IS NULL)')).toBe(true)
  })
  it('ECHTES LECK: (status = active) ohne uid/Scoping -> reachable', () => {
    expect(writeExprReachable("(status = 'active'::text)")).toBe(true)
  })
  it('gemischt (ungescopter Zweig OR admin) -> reachable (ein Zweig reicht)', () => {
    const expr =
      "((status = 'entwurf'::text) OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::user_role)))))"
    expect(writeExprReachable(expr)).toBe(true)
  })
})

describe('rowsToWriteViolations', () => {
  it('flaggt reachable + null-check_expr, ignoriert gescopte', () => {
    const rows = [
      { table_name: 'gutachter_finder_anfragen', policy_name: 'ins', cmd: 'INSERT', check_expr: '(source IS NULL)' },
      { table_name: 'claims', policy_name: 'upd', cmd: 'UPDATE', check_expr: "(( SELECT is_admin() AS is_admin) OR (kundenbetreuer_id = ( SELECT auth.uid() AS uid)))" },
      { table_name: 'kaputt', policy_name: 'nullcheck', cmd: 'INSERT', check_expr: null },
    ]
    expect(rowsToWriteViolations(rows)).toEqual(['gutachter_finder_anfragen.ins', 'kaputt.nullcheck'])
  })
})

describe('diffBaseline', () => {
  it('added = neue Verletzer, removed = behobene', () => {
    const d = diffBaseline(['a.p', 'c.p'], ['a.p', 'b.p'])
    expect(d.added).toEqual(['c.p'])
    expect(d.removed).toEqual(['b.p'])
  })
})
