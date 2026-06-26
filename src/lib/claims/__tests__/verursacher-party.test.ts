// Unit-Tests fuer den kanonischen verursacher-claim_party Helper.
// Mock-Konvention gespiegelt von ensure-person.test.ts (queue-basiert: jede terminale
// Operation dequeued die naechste Response; calls[] zeichnet table/op/payload auf).

import { describe, it, expect } from 'vitest'
import { findVerursacherParty, insertVerursacherParty } from '../verursacher-party'

type Resp = { data: unknown; error?: unknown }
type Call = { table: string; op: 'select' | 'insert' | 'update'; payload?: unknown }

function makeMockDb(responses: Resp[]) {
  const calls: Call[] = []
  let i = 0
  const next = () => {
    const r = responses[i++] ?? { data: null, error: null }
    return { data: r.data, error: r.error ?? null }
  }
  const builder = () => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.order = () => b
    b.limit = () => b
    b.maybeSingle = () => Promise.resolve(next())
    b.single = () => Promise.resolve(next())
    // awaited insert-/update-Chain endet ohne maybeSingle/single
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(res, rej)
    return b
  }
  const db = {
    from(table: string) {
      return {
        select: () => {
          calls.push({ table, op: 'select' })
          return builder()
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: 'insert', payload })
          return builder()
        },
        update: (payload: unknown) => {
          calls.push({ table, op: 'update', payload })
          return builder()
        },
      }
    },
  }
  return { db: db as never, calls }
}

describe('findVerursacherParty', () => {
  it('liefert die vorhandene verursacher-Party (id/person_id/firma_id)', async () => {
    const { db, calls } = makeMockDb([{ data: { id: 'vp1', person_id: 'p9', firma_id: null } }])
    const r = await findVerursacherParty(db, 'claim1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.party?.id).toBe('vp1')
      expect(r.party?.person_id).toBe('p9')
    }
    expect(calls).toEqual([{ table: 'claim_parties', op: 'select' }])
  })

  it('liefert party=null wenn keine verursacher-Party existiert', async () => {
    const { db } = makeMockDb([{ data: null }])
    const r = await findVerursacherParty(db, 'claim1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.party).toBeNull()
  })

  it('surfacet einen Select-Fehler als Result statt zu schlucken', async () => {
    const { db } = makeMockDb([{ data: null, error: { message: 'boom' } }])
    const r = await findVerursacherParty(db, 'claim1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('boom')
  })
})

describe('insertVerursacherParty', () => {
  it('legt mit kanonischen Defaults an (rolle=verursacher, reihenfolge=2) + merged extra', async () => {
    const { db, calls } = makeMockDb([{ data: null }])
    const r = await insertVerursacherParty(db, 'claim1', 'kunde_self', { kennzeichen: 'K-AB 123' })
    expect(r.ok).toBe(true)
    const ins = calls.find((c) => c.op === 'insert')
    expect(ins?.payload).toEqual({
      claim_id: 'claim1',
      rolle: 'verursacher',
      reihenfolge: 2,
      quelle: 'kunde_self',
      kennzeichen: 'K-AB 123',
    })
  })

  it('funktioniert ohne extra (Minimal-Insert)', async () => {
    const { db, calls } = makeMockDb([{ data: null }])
    const r = await insertVerursacherParty(db, 'claim1', 'manuell_kb')
    expect(r.ok).toBe(true)
    const ins = calls.find((c) => c.op === 'insert')
    expect(ins?.payload).toEqual({ claim_id: 'claim1', rolle: 'verursacher', reihenfolge: 2, quelle: 'manuell_kb' })
  })

  it('surfacet einen Insert-Fehler als Result', async () => {
    const { db } = makeMockDb([{ data: null, error: { message: 'constraint' } }])
    const r = await insertVerursacherParty(db, 'claim1', 'manuell_kb')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('constraint')
  })
})
