import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verknuepfeSessionsMitLead } from './verknuepfe-sessions'

// Nachtraegliche Verknuepfung (2026-09-09): nach der Lead-Anlage in submitCheckLead haengen alle
// Foto-Check-Sessions mit derselben Browser-Kennung, die noch keinen Lead haben, an den neuen Lead.
// Der Mock bildet nur die Supabase-Kette nach — geprueft wird, WAS gefiltert und geschrieben wird.

const REF = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const LEAD = 'fb1e0001-0000-4000-8000-000000000001'

type Calls = { from?: string; update?: unknown; eq: Array<[string, unknown]>; is: Array<[string, unknown]>; select?: string }

function fakeClient(result: { data: unknown[] | null; error: { message: string } | null }) {
  const calls: Calls = { eq: [], is: [] }
  const chain = {
    from(t: string) { calls.from = t; return chain },
    update(v: unknown) { calls.update = v; return chain },
    eq(c: string, v: unknown) { calls.eq.push([c, v]); return chain },
    is(c: string, v: unknown) { calls.is.push([c, v]); return chain },
    select(s: string) { calls.select = s; return Promise.resolve(result) },
  }
  return { client: chain as unknown as SupabaseClient, calls }
}

describe('verknuepfeSessionsMitLead', () => {
  it('haengt alle unverknuepften Sessions der ref an den Lead und liefert die Anzahl', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const r = await verknuepfeSessionsMitLead(client, REF, LEAD)
    expect(r).toEqual({ ok: true, anzahl: 2 })
    expect(calls.from).toBe('anspruch_schaetzungen')
    expect(calls.update).toEqual({ lead_id: LEAD })
    expect(calls.eq).toContainEqual(['check_ref', REF])
    expect(calls.is).toContainEqual(['lead_id', null])
    expect(calls.select).toBe('id')
  })

  it('liefert 0, wenn keine Session zur ref existiert', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await verknuepfeSessionsMitLead(client, REF, LEAD)).toEqual({ ok: true, anzahl: 0 })
  })

  it('meldet den DB-Fehler, statt ihn zu schlucken', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    expect(await verknuepfeSessionsMitLead(client, REF, LEAD)).toEqual({ ok: false, error: 'boom' })
  })

  it('tut ohne gueltige ref nichts — kein einziger DB-Aufruf', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'x' }], error: null })
    expect(await verknuepfeSessionsMitLead(client, null, LEAD)).toEqual({ ok: true, anzahl: 0 })
    expect(await verknuepfeSessionsMitLead(client, 'kaputt', LEAD)).toEqual({ ok: true, anzahl: 0 })
    expect(calls.from).toBeUndefined()
  })
})
