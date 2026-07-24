// Opt-in Parity-Test: SQL dokument_regel_trifft ≡ TS evaluateKatalogRule.
// Lauf: RUN_PARITY=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx vitest run
//   src/lib/dokumente/__tests__/sql-regel-parity.test.ts
// Die SQL-Seite wurde bereits direkt via execute_sql (17/17 Operator-Matrix) verifiziert;
// dieser Test ist der Regressions-Guard fuer kuenftige Aenderungen an ruleEvaluator.ts.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { evaluateKatalogRule, type Rule, type EvalContext } from '../ruleEvaluator'

const RUN = process.env.RUN_PARITY === '1'
const d = RUN ? describe : describe.skip

const CASES: Array<{ rule: Rule | null | Record<string, never>; ctx: EvalContext }> = [
  { rule: null, ctx: {} },
  { rule: {} as Record<string, never>, ctx: {} },
  { rule: { op: 'eq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: { 'lead.zb1_status': 'bestaetigt' } },
  { rule: { op: 'eq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: { 'lead.zb1_status': 'offen' } },
  { rule: { op: 'neq', field: 'lead.zb1_status', value: 'bestaetigt' }, ctx: {} },
  { rule: { op: 'eq', field: 'lead.halter_ungleich_fahrer_flag', value: true }, ctx: { 'lead.halter_ungleich_fahrer_flag': true } },
  { rule: { op: 'eq', field: 'x', value: 1 }, ctx: { x: '1' } },
  { rule: { op: 'eq', field: 'x', value: true }, ctx: { x: 'true' } },
  { rule: { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing', 'finanzierung'] }, ctx: { 'lead.finanzierung_leasing': 'leasing' } },
  { rule: { op: 'in', field: 'lead.finanzierung_leasing', value: ['leasing'] }, ctx: {} },
  { rule: { op: 'not_in', field: 'f', value: ['a'] }, ctx: {} },
  { rule: { op: 'is_not_null', field: 'lead.id' }, ctx: { 'lead.id': 'abc' } },
  { rule: { op: 'is_null', field: 'f' }, ctx: {} },
  { rule: { op: 'truthy', field: 'sv' }, ctx: { sv: 0 } },
  { rule: { op: 'truthy', field: 'sv' }, ctx: { sv: 'x' } },
  { rule: { op: 'falsy', field: 'sv' }, ctx: { sv: '' } },
  { rule: { op: 'gt', field: 'n', value: 5 }, ctx: { n: '7' } },
  { rule: { op: 'gte', field: 'n', value: 5 }, ctx: {} },
  { rule: { op: 'or', conditions: [{ op: 'eq', field: 'a', value: 1 }, { op: 'eq', field: 'b', value: 2 }] }, ctx: { b: 2 } },
  { rule: { op: 'and', conditions: [{ op: 'is_not_null', field: 'a' }, { op: 'eq', field: 'b', value: 2 }] }, ctx: { a: 1, b: 2 } },
  { rule: { op: 'not', condition: { op: 'eq', field: 'a', value: 1 } }, ctx: { a: 2 } },
]

d('dokument_regel_trifft ≡ evaluateKatalogRule', () => {
  it('matches TS on the full operator matrix', async () => {
    // createClient IM Test (nicht im describe-Body): laeuft nur wenn der RUN_PARITY-gegatete Test
    // wirklich ausgefuehrt wird — sonst warf createClient(undefined!) schon zur Collection-Zeit
    // (Suite-Load-Fehler; deshalb war die Datei vitest-baselined).
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    let mismatches = 0
    for (const c of CASES) {
      const ts = evaluateKatalogRule(c.rule as Rule, c.ctx)
      const { data, error } = await sb.rpc('dokument_regel_trifft', { regel: c.rule, ctx: c.ctx })
      if (error) throw error
      if (data !== ts) {
        mismatches++
        process.stdout.write(`MISMATCH rule=${JSON.stringify(c.rule)} ctx=${JSON.stringify(c.ctx)} ts=${ts} sql=${data}\n`)
      }
    }
    expect(mismatches).toBe(0)
  })
})
