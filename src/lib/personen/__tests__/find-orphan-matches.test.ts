// Identitaets-Engine §12 Login-Tor — Slice A (read-only Detection).
// Unit-Tests fuer findOrphanPersonMatchesForUser: liest die Account-Person
// (personen.user_id) + ruft match_person_candidates (excl. self), filtert nach
// Tier. KEIN Write, KEIN Auto-Merge. Non-throwing Result-Object.

import { describe, it, expect } from 'vitest'
import { findOrphanPersonMatchesForUser } from '../find-orphan-matches'

type Resp = { data: unknown; error?: unknown }

function makeMockDb(opts: { personenResp: Resp; rpcResp?: Resp }) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const builder = (resp: Resp) => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.limit = () => b
    b.maybeSingle = () => Promise.resolve({ data: resp.data, error: resp.error ?? null })
    return b
  }
  const db = {
    from(_table: string) {
      return { select: () => builder(opts.personenResp) }
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      const r = opts.rpcResp ?? { data: [], error: null }
      return Promise.resolve({ data: r.data, error: r.error ?? null })
    },
  }
  return { db: db as never, rpcCalls }
}

describe('findOrphanPersonMatchesForUser', () => {
  it('keine Account-Person (user_id nicht in personen): leere matches, KEIN RPC', async () => {
    const { db, rpcCalls } = makeMockDb({ personenResp: { data: null } })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u1' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.matches).toEqual([])
    expect(rpcCalls).toHaveLength(0)
  })

  it('filtert weiche Matches raus (default minTier=stark) + uebergibt p_exclude_person_id', async () => {
    const { db, rpcCalls } = makeMockDb({
      personenResp: {
        data: { id: 'acct', email: 'a@b.de', telefon: '0170', vorname: 'Max', nachname: 'Mustermann', geburtsdatum: '1990-01-01' },
      },
      rpcResp: {
        data: [
          { person_id: 'orph-hart', score: 60, tier: 'hart', signals: ['verified_email'] },
          { person_id: 'orph-weich', score: 15, tier: 'weich', signals: ['typed_email'] },
        ],
      },
    })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u2' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.matches.map((m) => m.personId)).toEqual(['orph-hart'])
      expect(r.matches[0].tier).toBe('hart')
      expect(r.matches[0].signals).toEqual(['verified_email'])
    }
    expect(rpcCalls[0].fn).toBe('match_person_candidates')
    expect(rpcCalls[0].args.p_exclude_person_id).toBe('acct')
  })

  it('behaelt stark-Matches (name+gebdat) bei default minTier', async () => {
    const { db } = makeMockDb({
      personenResp: { data: { id: 'acct' } },
      rpcResp: { data: [{ person_id: 'orph-stark', score: 35, tier: 'stark', signals: ['name_gebdat'] }] },
    })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u3' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.matches.map((m) => m.personId)).toEqual(['orph-stark'])
  })

  it('minTier=hart filtert stark raus', async () => {
    const { db } = makeMockDb({
      personenResp: { data: { id: 'acct' } },
      rpcResp: {
        data: [
          { person_id: 'h', score: 60, tier: 'hart', signals: [] },
          { person_id: 's', score: 35, tier: 'stark', signals: [] },
        ],
      },
    })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u7', minTier: 'hart' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.matches.map((m) => m.personId)).toEqual(['h'])
  })

  it('keine Kandidaten: leere matches', async () => {
    const { db } = makeMockDb({ personenResp: { data: { id: 'acct' } }, rpcResp: { data: [] } })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u4' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.matches).toEqual([])
  })

  it('Probe nutzt telefon, faellt auf mobil zurueck', async () => {
    const { db, rpcCalls } = makeMockDb({
      personenResp: { data: { id: 'acct', telefon: null, mobil: '0171' } },
      rpcResp: { data: [] },
    })
    await findOrphanPersonMatchesForUser({ db, userId: 'u8' })
    expect(rpcCalls[0].args.p_phone).toBe('0171')
  })

  it('liefert ok:false (wirft nicht) bei personen-Fehler', async () => {
    const { db } = makeMockDb({ personenResp: { data: null, error: { message: 'db down' } } })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u5' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('db down')
  })

  it('liefert ok:false bei RPC-Fehler', async () => {
    const { db } = makeMockDb({
      personenResp: { data: { id: 'acct' } },
      rpcResp: { data: null, error: { message: 'rpc boom' } },
    })
    const r = await findOrphanPersonMatchesForUser({ db, userId: 'u6' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('rpc boom')
  })
})
