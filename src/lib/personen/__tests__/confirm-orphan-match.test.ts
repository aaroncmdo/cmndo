// Identitaets-Engine §12 Login-Tor — Slice B (Self-Confirm Relink).
// Unit-Tests fuer confirmOrphanPersonIsMe: haengt die claim_parties einer Orphan-Person
// (ohne eigenen Account) auf die Account-Person des Users um (Re-Point), markiert die
// Orphan-Person als Tombstone (canonical_person_id) und haelt previous_person_id pro Partei.
// Integritaets-Guards in der Lib; Authz (Kandidaten-Re-Check) liegt im Caller/Action.
// Non-throwing Result-Object. Muster wie ensure-person.ts.

import { describe, it, expect } from 'vitest'
import { confirmOrphanPersonIsMe } from '../confirm-orphan-match'

type Resp = { data: unknown; error?: unknown }

/**
 * Routet die 4 logischen DB-Calls der Lib:
 *  - personenById      : from('personen').select(...).eq('id', orphan).maybeSingle()
 *  - personenByUserId  : from('personen').select('id').eq('user_id', user).maybeSingle()
 *  - claimPartiesUpdate: from('claim_parties').update(...).eq('person_id', orphan).select('id')
 *  - personenUpdate    : from('personen').update(...).eq('id', orphan).select('id')
 * Terminal = maybeSingle() (Read) bzw. select() nach update() (Write).
 */
function makeMockDb(routes: {
  personenById?: Resp
  personenByUserId?: Resp
  claimPartiesUpdate?: Resp
  personenUpdate?: Resp
}) {
  const calls: { table: string; op: 'select' | 'update'; eq: Record<string, unknown>; payload?: unknown }[] = []
  function builder(table: string) {
    const st = { op: 'select' as 'select' | 'update', eq: {} as Record<string, unknown>, payload: undefined as unknown }
    const resolveRead = () => {
      if (table === 'personen' && 'id' in st.eq) { const r = routes.personenById ?? { data: null }; return { data: r.data, error: r.error ?? null } }
      if (table === 'personen' && 'user_id' in st.eq) { const r = routes.personenByUserId ?? { data: null }; return { data: r.data, error: r.error ?? null } }
      return { data: null, error: null }
    }
    const resolveWrite = () => {
      if (table === 'claim_parties') { const r = routes.claimPartiesUpdate ?? { data: [] }; return { data: r.data, error: r.error ?? null } }
      if (table === 'personen') { const r = routes.personenUpdate ?? { data: null }; return { data: r.data ?? null, error: r.error ?? null } }
      return { data: null, error: null }
    }
    const api: Record<string, unknown> = {}
    api.select = (_cols?: string) => {
      if (st.op === 'update') { calls.push({ table, op: 'update', eq: { ...st.eq }, payload: st.payload }); return Promise.resolve(resolveWrite()) }
      return api
    }
    api.update = (payload: unknown) => { st.op = 'update'; st.payload = payload; return api }
    api.eq = (k: string, v: unknown) => { st.eq[k] = v; return api }
    api.maybeSingle = () => { calls.push({ table, op: 'select', eq: { ...st.eq } }); return Promise.resolve(resolveRead()) }
    return api
  }
  return { db: { from: (t: string) => builder(t) } as never, calls }
}

const ORPHAN = 'orphan-1'
const ACCOUNT = 'acct-1'
const USER = 'user-1'

describe('confirmOrphanPersonIsMe', () => {
  it('Happy Path: re-pointed Parteien auf Account + setzt Tombstone + previous_person_id', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: null, canonical_person_id: null } },
      personenByUserId: { data: { id: ACCOUNT } },
      claimPartiesUpdate: { data: [{ id: 'p1' }, { id: 'p2' }] },
      personenUpdate: { data: [{ id: ORPHAN }] },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.accountPersonId).toBe(ACCOUNT)
      expect(r.repointedParties).toBe(2)
      expect(r.alreadyConfirmed).toBe(false)
    }
    const cpUpdate = calls.find((c) => c.table === 'claim_parties' && c.op === 'update')
    expect(cpUpdate?.payload).toEqual({ person_id: ACCOUNT, previous_person_id: ORPHAN })
    expect(cpUpdate?.eq).toEqual({ person_id: ORPHAN })
    const tombstone = calls.find((c) => c.table === 'personen' && c.op === 'update')
    expect(tombstone?.payload).toEqual({ canonical_person_id: ACCOUNT })
    expect(tombstone?.eq).toEqual({ id: ORPHAN })
  })

  it('Orphan nicht gefunden -> ok:false, keine Writes', async () => {
    const { db, calls } = makeMockDb({ personenById: { data: null } })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('keine Account-Person -> ok:false, keine Writes', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: null, canonical_person_id: null } },
      personenByUserId: { data: null },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('Orphan hat eigenen Account (user_id) -> abgelehnt (Hard-Merge), keine Writes', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: 'fremder-user', canonical_person_id: null } },
      personenByUserId: { data: { id: ACCOUNT } },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('account')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('bereits demselben Account zugeordnet -> idempotent ok:true, keine Writes', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: null, canonical_person_id: ACCOUNT } },
      personenByUserId: { data: { id: ACCOUNT } },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.alreadyConfirmed).toBe(true)
      expect(r.repointedParties).toBe(0)
    }
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('bereits ANDERER Person zugeordnet -> ok:false, keine Writes', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: null, canonical_person_id: 'andere-person' } },
      personenByUserId: { data: { id: ACCOUNT } },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('Orphan == Account-Person -> abgelehnt, keine Writes', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ACCOUNT, user_id: null, canonical_person_id: null } },
      personenByUserId: { data: { id: ACCOUNT } },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ACCOUNT })
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('DB-Fehler beim Re-Point -> ok:false (kein Tombstone-Write danach)', async () => {
    const { db, calls } = makeMockDb({
      personenById: { data: { id: ORPHAN, user_id: null, canonical_person_id: null } },
      personenByUserId: { data: { id: ACCOUNT } },
      claimPartiesUpdate: { data: null, error: { message: 'repoint boom' } },
    })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('repoint boom')
    expect(calls.some((c) => c.table === 'personen' && c.op === 'update')).toBe(false)
  })

  it('liefert ok:false (wirft nicht) bei Lese-Fehler', async () => {
    const { db } = makeMockDb({ personenById: { data: null, error: { message: 'db down' } } })
    const r = await confirmOrphanPersonIsMe({ db, userId: USER, orphanPersonId: ORPHAN })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('db down')
  })
})
