// Tranche W (T3): ensureReparaturTerminAngefragt — idempotenter reparatur_termine-Anleger.
//
// Chain-Mock: der Helper hat genau zwei terminale Ketten —
//   Read  : from('reparatur_termine').select('id').eq().in().limit(1)   -> Response #1
//   Insert: from('reparatur_termine').insert({...}).select('id')        -> Response #2
// Jede Kette resolved die naechste Response aus der Queue in Aufruf-Reihenfolge (angelehnt
// an den Queue-Mock aus src/lib/leads/__tests__/convert-lead-to-claim.test.ts, minimiert).

import { describe, it, expect } from 'vitest'
import { ensureReparaturTerminAngefragt } from '../ensure-reparatur-termin'

type Captured = { table: string; op: 'select' | 'insert'; payload?: unknown }

function makeAdmin(responses: Array<{ data: unknown; error: unknown }>) {
  const captured: Captured[] = []
  let i = 0
  const next = () => responses[i++] ?? { data: null, error: null }

  // Jede Nicht-terminal-Methode gibt die Kette zurueck; `then` macht die Kette awaitable
  // und shiftet die naechste Response (egal ob nach .limit() oder nach .select()).
  const builder = () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'limit', 'is', 'order']) chain[m] = () => chain
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve)
    return chain
  }

  const admin = {
    from(table: string) {
      return {
        select: (_cols: string) => {
          captured.push({ table, op: 'select' })
          return builder()
        },
        insert: (payload: unknown) => {
          captured.push({ table, op: 'insert', payload })
          return builder()
        },
      }
    },
  }
  // Der Helper-Parameter ist ReturnType<typeof createAdminClient> (ungetypter Client);
  // der Mock deckt nur die genutzten Methoden ab.
  return { admin: admin as never, captured }
}

describe('ensureReparaturTerminAngefragt', () => {
  it('noop: offene Row existiert -> kein Insert, created=false', async () => {
    const { admin, captured } = makeAdmin([
      { data: [{ id: 'rt-bestehend' }], error: null }, // Read: eine offene Row
    ])

    const r = await ensureReparaturTerminAngefragt(admin, {
      claimId: 'claim-1',
      werkstattId: 'werkstatt-1',
      erstelltVon: 'user-1',
    })

    expect(r).toEqual({ ok: true, created: false })
    // Kein Insert abgesetzt.
    expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0)
  })

  it('insert: keine offene Row -> legt status=angefragt/wunschtermin=null an, created=true', async () => {
    const { admin, captured } = makeAdmin([
      { data: [], error: null },                     // Read: keine offene Row
      { data: [{ id: 'rt-neu' }], error: null },     // Insert: Row angelegt
    ])

    const r = await ensureReparaturTerminAngefragt(admin, {
      claimId: 'claim-2',
      werkstattId: 'werkstatt-2',
      erstelltVon: 'user-2',
    })

    expect(r).toEqual({ ok: true, created: true })
    const insert = captured.find((c) => c.op === 'insert')
    expect(insert).toBeTruthy()
    expect(insert!.payload).toEqual({
      claim_id: 'claim-2',
      werkstatt_id: 'werkstatt-2',
      status: 'angefragt',
      wunschtermin: null,
      erstellt_von: 'user-2',
    })
  })

  it('insert-error: Insert liefert error -> ok=false, created=false', async () => {
    const { admin } = makeAdmin([
      { data: [], error: null },                        // Read: keine offene Row
      { data: null, error: { message: 'insert kaputt' } }, // Insert: Fehler
    ])

    const r = await ensureReparaturTerminAngefragt(admin, {
      claimId: 'claim-3',
      werkstattId: 'werkstatt-3',
      erstelltVon: null,
    })

    expect(r).toEqual({ ok: false, created: false, error: 'insert kaputt' })
  })

  it('read-error: Read liefert error -> ok=false, kein Insert', async () => {
    const { admin, captured } = makeAdmin([
      { data: null, error: { message: 'read kaputt' } }, // Read: Fehler
    ])

    const r = await ensureReparaturTerminAngefragt(admin, {
      claimId: 'claim-4',
      werkstattId: 'werkstatt-4',
      erstelltVon: 'user-4',
    })

    expect(r).toEqual({ ok: false, created: false, error: 'read kaputt' })
    expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0)
  })
})
