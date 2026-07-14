import { describe, it, expect } from 'vitest'
import { scanSql, diffBaseline } from './rls-policy-scan.mjs'

describe('rls-policy-scan — VERLETZUNGEN (muessen greifen)', () => {
  it('flaggt fehlende TO-Klausel (Postgres-Default = TO public)', () => {
    const r = scanSql(`CREATE POLICY "Admin full access x" ON public.x USING (is_admin());`)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'missing-to', table: 'public.x' })
  })

  it('flaggt explizites TO public', () => {
    const r = scanSql(`CREATE POLICY staff_all ON public.calls FOR ALL TO public USING (is_staff());`)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'to-public', policy: 'staff_all' })
  })

  it('flaggt ueber mehrere Zeilen (realer Stil im Repo)', () => {
    const r = scanSql(`CREATE POLICY vv_staff_all ON public.vehicle_vorschaeden\n  FOR ALL TO public\n  USING (is_staff());`)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('to-public')
  })

  it('flaggt dynamisches SQL OHNE Platzhalter (hardcoded, kein TO)', () => {
    const r = scanSql(`DO $$ BEGIN EXECUTE 'CREATE POLICY x ON t USING (true)'; END $$;`)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('missing-to')
  })
})

describe('rls-policy-scan — AUSNAHMEN (duerfen NIE flaggen = keine False Positives)', () => {
  it('explizite Rollen sind ok', () => {
    expect(scanSql(`CREATE POLICY p ON public.t FOR SELECT TO authenticated USING (true);`)).toHaveLength(0)
    expect(scanSql(`CREATE POLICY p ON public.t FOR SELECT TO anon, authenticated USING (true);`)).toHaveLength(0)
    expect(scanSql(`CREATE POLICY "Admins full access" ON public.parteien TO authenticated USING (is_admin());`)).toHaveLength(0)
  })

  it('AS RESTRICTIVE mit TO public ist KORREKT (verengen wuerde die Restriktion LOCKERN)', () => {
    const sql = `CREATE POLICY nachrichten_thread_insert_member_only ON public.nachrichten
                 AS RESTRICTIVE FOR INSERT TO public WITH CHECK (ist_teilnehmer(thread_id));`
    expect(scanSql(sql)).toHaveLength(0)
  })

  it('dynamisches SQL MIT Platzhaltern ist exempt (Rollen zur Laufzeit) — der B1-Block', () => {
    const sql = `EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO %s USING (%s)', nm, p_table, p_roles, p_using);`
    expect(scanSql(sql)).toHaveLength(0)
  })

  it('ein "to" IM QUAL maskiert keine fehlende Klausel — nur der Header zaehlt', () => {
    // `to` taucht im USING-Ausdruck auf; die Policy hat aber KEINE TO-Klausel -> muss flaggen
    const r = scanSql(`CREATE POLICY p ON public.t USING (status = 'to_review');`)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('missing-to')
  })

  it('CREATE POLICY in einem KOMMENTAR wird ignoriert', () => {
    expect(scanSql(`-- CREATE POLICY foo ON t USING (true);\nSELECT 1;`)).toHaveLength(0)
    expect(scanSql(`/* CREATE POLICY foo ON t USING (true); */\nSELECT 1;`)).toHaveLength(0)
  })

  it('DROP/ALTER POLICY sind keine CREATE POLICY', () => {
    expect(scanSql(`DROP POLICY x ON public.t;`)).toHaveLength(0)
    expect(scanSql(`ALTER POLICY x ON public.t TO anon, authenticated;`)).toHaveLength(0)
  })
})

describe('rls-policy-scan — Baseline-Diff (Ratchet-Semantik)', () => {
  it('meldet NEUE Verletzer, ignoriert bekannte', () => {
    const d = diffBaseline(['alt.sql', 'neu.sql'], ['alt.sql'])
    expect(d.added).toEqual(['neu.sql'])
    expect(d.removed).toEqual([])
  })

  it('meldet behobene Verletzer (Baseline senkbar)', () => {
    const d = diffBaseline([], ['alt.sql'])
    expect(d.added).toEqual([])
    expect(d.removed).toEqual(['alt.sql'])
  })

  it('unveraendert = keine neuen', () => {
    expect(diffBaseline(['a.sql'], ['a.sql']).added).toEqual([])
  })
})
