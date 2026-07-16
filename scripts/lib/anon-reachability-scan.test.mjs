import { describe, it, expect } from 'vitest'
import {
  stripOuterParens,
  topLevelOrBranches,
  qualReachableOhneUid,
  rowsToViolations,
  diffBaseline,
} from './anon-reachability-scan.mjs'

describe('stripOuterParens', () => {
  it('entfernt EIN umschliessendes Paar', () => {
    expect(stripOuterParens('(a OR b)')).toBe('a OR b')
  })
  it('entfernt geschachtelte umschliessende Paare', () => {
    expect(stripOuterParens('(((x)))')).toBe('x')
  })
  it('laesst `(a) OR (b)` unangetastet (erste ( matcht nicht letzte ))', () => {
    expect(stripOuterParens('(a) OR (b)')).toBe('(a) OR (b)')
  })
})

describe('topLevelOrBranches', () => {
  it('splittet top-level OR trotz aeusserer Klammer (pg_get_expr-Wrapping)', () => {
    // Genau das gutachter_finder_anfragen-Muster: aeussere Klammer + verschachtelte OR.
    const qual =
      "(((source IS NULL) AND (erstellt_am > now())) OR (EXISTS ( SELECT 1 FROM profiles WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))"
    const branches = topLevelOrBranches(qual)
    expect(branches).toHaveLength(2)
    expect(branches[0]).toContain('source IS NULL')
  })
  it('splittet nicht innerhalb geschachtelter Klammern', () => {
    expect(topLevelOrBranches('a AND (b OR c)')).toEqual(['a AND (b OR c)'])
  })
})

describe('qualReachableOhneUid', () => {
  it('qual = true -> reachable (voll offen)', () => {
    expect(qualReachableOhneUid('true')).toBe(true)
  })
  it('DAS LECK: (source IS NULL AND zeit) OR admin-auth.uid -> reachable', () => {
    const qual =
      "(((source IS NULL) AND (erstellt_am > (now() - '00:05:00'::interval))) OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::user_role)))))"
    expect(qualReachableOhneUid(qual)).toBe(true)
  })
  it('status-gated public (kein uid) -> reachable', () => {
    expect(qualReachableOhneUid("(status = 'veroeffentlicht'::text)")).toBe(true)
  })
  it('is_staff() -> NICHT reachable (uid-Gate-Helper)', () => {
    expect(qualReachableOhneUid('( SELECT is_staff() AS is_staff)')).toBe(false)
  })
  it('auth.role() = authenticated -> NICHT reachable', () => {
    expect(qualReachableOhneUid("(( SELECT auth.role() AS role) = 'authenticated'::text)")).toBe(false)
  })
  it('reine auth.uid()-Kette (alle Zweige gated) -> NICHT reachable', () => {
    const qual =
      "((current_owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::user_role)))))"
    expect(qualReachableOhneUid(qual)).toBe(false)
  })
  it('article_comments: (status=approved) OR (author=auth.uid) -> reachable', () => {
    const qual = "((status = 'approved'::comment_status) OR (author_id = ( SELECT auth.uid() AS uid)))"
    expect(qualReachableOhneUid(qual)).toBe(true)
  })
  it('Anti-Pattern auth.uid() IS NULL -> reachable', () => {
    expect(qualReachableOhneUid('(( SELECT auth.uid() AS uid) IS NULL)')).toBe(true)
  })
})

describe('rowsToViolations', () => {
  it('flaggt reachable qual auf PII-Tabelle, ignoriert leere pii_columns', () => {
    const rows = [
      { table_name: 'gutachter_finder_anfragen', policy_name: 'b1sel_an', pii_columns: ['telefon', 'email'], qual: "(((source IS NULL) AND (erstellt_am > now())) OR (EXISTS ( SELECT 1 FROM profiles WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))" },
      { table_name: 'nur_referenz', policy_name: 'x', pii_columns: [], qual: 'true' }, // kein PII -> raus
    ]
    expect(rowsToViolations(rows)).toEqual(['gutachter_finder_anfragen.b1sel_an'])
  })
  it('uid-gated PII-Tabellen sind keine Verletzer (Baseline 0 nach Fix)', () => {
    const rows = [
      { table_name: 'aircall_calls', policy_name: 'staff', pii_columns: ['aircall_user_email'], qual: "(EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.rolle = 'admin'::user_role))))" },
      { table_name: 'cold_mail_sends', policy_name: 'staff', pii_columns: ['empfaenger_email'], qual: '( SELECT is_staff() AS is_staff)' },
    ]
    expect(rowsToViolations(rows)).toEqual([])
  })
})

describe('diffBaseline', () => {
  it('added = neue Verletzer, removed = behobene', () => {
    const d = diffBaseline(['a.p', 'c.p'], ['a.p', 'b.p'])
    expect(d.added).toEqual(['c.p'])
    expect(d.removed).toEqual(['b.p'])
  })
  it('neue reachable-PII-Policy -> added faengt sie', () => {
    expect(diffBaseline(['neu.leak'], []).added).toEqual(['neu.leak'])
  })
})
