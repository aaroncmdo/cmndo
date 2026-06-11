// CMM Entity-Model Phase 3: Unit-Tests fuer den personen-Write-Path-Helper.
//
// Wir mocken den Supabase-Builder minimal (queue-basiert: jede terminale
// Operation — maybeSingle/single/awaited-update — dequeued die naechste Response)
// und pruefen die Dedup-/Link-Semantik (Aaron 03.06., Insight #4):
//   - Account (user_id)   -> 1 personen pro user_id (find-or-create)
//   - ohne Account        -> immer neue personen (KEIN Auto-Merge)
//   - anonym -> Account    -> re-point auf Account-Person bzw. No-Account-Person promoten

import { describe, it, expect } from 'vitest'
import { ensurePersonForData, relinkPartyPersonOnAccount } from '../ensure-person'

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
    b.limit = () => b
    b.maybeSingle = () => Promise.resolve(next())
    b.single = () => Promise.resolve(next())
    // awaited update-Chain (.from().update().eq()) endet ohne maybeSingle/single
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

describe('ensurePersonForData', () => {
  it('Account mit existierender Person: liefert vorhandene id, KEIN Insert (Dedup)', async () => {
    const { db, calls } = makeMockDb([{ data: { id: 'p-existing' } }])
    const r = await ensurePersonForData({ db, userId: 'u1', snapshot: { nachname: 'Müller' } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.personId).toBe('p-existing')
      expect(r.created).toBe(false)
    }
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0)
  })

  it('Account ohne existierende Person: legt personen mit user_id an', async () => {
    const { db, calls } = makeMockDb([
      { data: null }, // select by user_id -> none
      { data: { id: 'p-new' } }, // insert -> id
    ])
    const r = await ensurePersonForData({ db, userId: 'u2', snapshot: { nachname: 'Schmidt' } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.personId).toBe('p-new')
      expect(r.created).toBe(true)
    }
    const ins = calls.find((c) => c.op === 'insert' && c.table === 'personen')
    expect(ins).toBeTruthy()
    expect((ins!.payload as { user_id: unknown }).user_id).toBe('u2')
  })

  it('ohne Account: legt IMMER neue personen an (kein Select, kein Auto-Merge)', async () => {
    const { db, calls } = makeMockDb([{ data: { id: 'p-anon' } }])
    const r = await ensurePersonForData({ db, userId: null, snapshot: { nachname: 'Gegner' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.created).toBe(true)
    // kein Account -> kein Dedup-Select
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(0)
    const ins = calls.find((c) => c.op === 'insert' && c.table === 'personen')
    expect((ins!.payload as { user_id: unknown }).user_id).toBeNull()
  })

  it('CMM-Entity (A): ohne Account UND ohne Identitaet -> skip (kein personen-Insert)', async () => {
    const { db, calls } = makeMockDb([])
    const r = await ensurePersonForData({ db, userId: null, snapshot: { adresse_ort: 'Koeln' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.personId).toBeNull()
    expect(calls.filter((c) => c.op === 'insert' && c.table === 'personen')).toHaveLength(0)
  })

  it('fuehrerscheinklassen text[] -> text (join), KEIN Array ins text-Feld', async () => {
    const { db, calls } = makeMockDb([{ data: { id: 'p-fs' } }])
    await ensurePersonForData({ db, userId: null, snapshot: { nachname: 'Fahrer', fuehrerscheinklassen: ['B', 'BE'] } })
    const ins = calls.find((c) => c.op === 'insert' && c.table === 'personen')
    expect((ins!.payload as { fuehrerscheinklassen: unknown }).fuehrerscheinklassen).toBe('B, BE')
  })

  it('liefert ok:false (wirft nicht) wenn der Insert fehlschlägt', async () => {
    const { db } = makeMockDb([
      { data: null }, // select -> none
      { data: null, error: { message: 'boom' } }, // insert -> error
    ])
    const r = await ensurePersonForData({ db, userId: 'u3', snapshot: {} })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('boom')
  })
})

describe('relinkPartyPersonOnAccount', () => {
  it('Account-Person existiert bereits: re-pointet claim_parties.person_id darauf', async () => {
    const { db, calls } = makeMockDb([
      { data: { id: 'pa1', person_id: 'p-old', user_id: 'u5' } }, // party load
      { data: { id: 'p-acct' } }, // personen by user_id -> existing account person
      { data: null }, // update claim_parties.person_id
    ])
    const r = await relinkPartyPersonOnAccount({ db, partyId: 'pa1', userId: 'u5' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.personId).toBe('p-acct')
    const upd = calls.find((c) => c.op === 'update' && c.table === 'claim_parties')
    expect(upd).toBeTruthy()
    expect((upd!.payload as { person_id: unknown }).person_id).toBe('p-acct')
  })

  it('keine Account-Person, aber No-Account-Person vorhanden: promotet sie (setzt user_id)', async () => {
    const { db, calls } = makeMockDb([
      { data: { id: 'pa2', person_id: 'p-noacct', user_id: 'u6' } }, // party load
      { data: null }, // personen by user_id -> none
      { data: null }, // update personen.user_id (promote)
    ])
    const r = await relinkPartyPersonOnAccount({ db, partyId: 'pa2', userId: 'u6' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.personId).toBe('p-noacct')
    const upd = calls.find((c) => c.op === 'update' && c.table === 'personen')
    expect(upd).toBeTruthy()
    expect((upd!.payload as { user_id: unknown }).user_id).toBe('u6')
  })
})
