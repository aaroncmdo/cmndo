import { describe, it, expect } from 'vitest'
import { runProvisionsRelease, RELEASE_PARTNER_TYPEN } from '../release-runner'
import type { ReleasePendingRow } from '../release-runner'

const NOW = '2026-07-14T02:00:00.000Z'
const vorTagen = (n: number) => new Date(new Date(NOW).getTime() - n * 24 * 60 * 60 * 1000).toISOString()

type FakeRow = Record<string, unknown>
type FakeOpts = {
  pending?: FakeRow[]
  claims?: FakeRow[]
  termine?: FakeRow[]
  pendingError?: string
}

// Chainable Fake-Supabase (thenable): from(table).select().in().eq().limit() -> await = { data, error }
//                                     from(table).update(patch).in('id', ids) -> await = { error }
function fakeDb(opts: FakeOpts) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const updates: { table: string; patch: FakeRow; ids: string[] }[] = []

  const make = (table: string) => {
    const c: Record<string, unknown> & { [k: string]: any } = {}
    let isUpdate = false
    let patch: FakeRow = {}
    let ids: string[] = []

    const rec = (method: string, args: unknown[]) => calls.push({ table, method, args })

    c.select = (...a: unknown[]) => { rec('select', a); return c }
    c.eq = (...a: unknown[]) => { rec('eq', a); return c }
    c.not = (...a: unknown[]) => { rec('not', a); return c }
    c.order = (...a: unknown[]) => { rec('order', a); return c }
    c.limit = (...a: unknown[]) => { rec('limit', a); return c }
    c.update = (p: FakeRow) => { isUpdate = true; patch = p; return c }
    c.in = (...a: unknown[]) => {
      rec('in', a)
      if (isUpdate && a[0] === 'id') ids = a[1] as string[]
      return c
    }
    c.then = (resolve: (v: unknown) => unknown) => {
      if (isUpdate) {
        updates.push({ table, patch, ids })
        return Promise.resolve({ error: null }).then(resolve)
      }
      if (table === 'partner_provisionen') {
        if (opts.pendingError) return Promise.resolve({ data: null, error: { message: opts.pendingError } }).then(resolve)
        return Promise.resolve({ data: opts.pending ?? [], error: null }).then(resolve)
      }
      if (table === 'claims') return Promise.resolve({ data: opts.claims ?? [], error: null }).then(resolve)
      return Promise.resolve({ data: opts.termine ?? [], error: null }).then(resolve)
    }
    return c
  }

  return { _calls: calls, _updates: updates, from: (t: string) => make(t) } as any
}

const pendingRow = (over: Partial<ReleasePendingRow> = {}): FakeRow => ({
  id: 'p1',
  partner_typ: 'firmen_flotte',
  fall_id: 'c1',
  claim_id: 'c1',
  betrag_netto_eur: 150,
  service_typ: 'komplett',
  partner_id: 'konto-1',
  ...over,
})

const abgeschlossenerClaim = (over: FakeRow = {}): FakeRow => ({
  id: 'c1',
  claim_nummer: 'CLM-2026-00001',
  operative_status: 'abgeschlossen',
  status: null,
  service_typ: 'komplett',
  abgeschlossen_am: vorTagen(8),
  ...over,
})

describe('runProvisionsRelease — generischer Release (loest den per-Typ-Cron ab)', () => {
  it('selektiert pending Provisionen ALLER uebergebenen partner_typen (nicht nur einen)', async () => {
    const db = fakeDb({ pending: [] })

    await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })

    const typFilter = db._calls.find(
      (c: { table: string; method: string; args: unknown[] }) =>
        c.table === 'partner_provisionen' && c.method === 'in' && c.args[0] === 'partner_typ',
    )
    expect(typFilter).toBeDefined()
    expect(typFilter.args[1]).toEqual(['makler', 'werkstatt', 'firmen_flotte'])
  })

  it('firmen_flotte: abgeschlossener Claim + 7d vorbei -> freigegeben (heute: bleibt ewig pending)', async () => {
    const db = fakeDb({ pending: [pendingRow()], claims: [abgeschlossenerClaim()] })

    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })

    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(1)
    expect(r.storniert).toBe(0)
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'freigegeben' },
      ids: ['p1'],
    })
  })

  it('firmen_flotte: Claim storniert -> Provision storniert (heute: nie storniert)', async () => {
    const db = fakeDb({
      pending: [pendingRow()],
      claims: [abgeschlossenerClaim({ operative_status: 'storniert', abgeschlossen_am: null })],
    })

    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })

    if (!r.ok) throw new Error(r.error)
    expect(r.storniert).toBe(1)
    expect(r.released).toBe(0)
    expect(db._updates[0].patch).toMatchObject({ status: 'storniert', storno_grund: 'fall_storniert' })
  })

  it('Claim noch nicht abgeschlossen -> HOLD (weder freigegeben noch storniert)', async () => {
    const db = fakeDb({
      pending: [pendingRow()],
      claims: [abgeschlossenerClaim({ operative_status: 'sv-termin', abgeschlossen_am: null })],
    })

    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })

    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(0)
    expect(r.storniert).toBe(0)
    expect(db._updates).toHaveLength(0)
  })

  it('onStatusChange wird pro betroffener Row mit partner_typ gerufen (Route benachrichtigt nur makler)', async () => {
    const gesehen: [string, string][] = []
    const db = fakeDb({
      pending: [
        pendingRow({ id: 'p-makler', partner_typ: 'makler', partner_id: 'makler-1' }),
        pendingRow({ id: 'p-flotte', partner_typ: 'firmen_flotte', partner_id: 'konto-1' }),
      ],
      claims: [abgeschlossenerClaim()],
    })

    const r = await runProvisionsRelease(db, {
      partnerTypen: RELEASE_PARTNER_TYPEN,
      now: NOW,
      onStatusChange: async (row, status) => {
        gesehen.push([row.partner_typ, status])
        return row.partner_typ === 'makler' // nur makler wird wirklich benachrichtigt
      },
    })

    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(2)
    expect(gesehen).toEqual([
      ['makler', 'freigegeben'],
      ['firmen_flotte', 'freigegeben'],
    ])
    expect(r.notifsEmitted).toBe(1) // nur der makler-Hook lieferte true
  })

  it('DB-Fehler beim Laden -> { ok: false, error } (Route macht daraus 500)', async () => {
    const db = fakeDb({ pendingError: 'connection reset' })

    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected failure')
    expect(r.error).toBe('connection reset')
  })

  // P3 (Netzwerk): Freundes-Graph-Gate — intra-Netzwerk-Provisionen werden unterdrueckt statt freigegeben.
  it('Suppression-Gate: intra-Row -> unterdrueckt (nicht freigegeben, kein notify); cross-Row -> freigegeben', async () => {
    const gesehen: [string, string][] = []
    const db = fakeDb({
      pending: [
        pendingRow({ id: 'p-intra', partner_typ: 'werkstatt', partner_id: 'w1' }),
        pendingRow({ id: 'p-cross', partner_typ: 'werkstatt', partner_id: 'w2' }),
      ],
      claims: [abgeschlossenerClaim()],
    })

    const r = await runProvisionsRelease(db, {
      partnerTypen: RELEASE_PARTNER_TYPEN,
      now: NOW,
      onStatusChange: async (row, status) => { gesehen.push([row.id, status]); return false },
      bestimmeUnterdrueckteProvisionen: async () => new Set(['p-intra']),
    })

    if (!r.ok) throw new Error(r.error)
    expect(r.unterdrueckt).toBe(1)
    expect(r.released).toBe(1)
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'unterdrueckt', storno_grund: 'intra_netzwerk' },
      ids: ['p-intra'],
    })
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'freigegeben' },
      ids: ['p-cross'],
    })
    // K13 "still": die unterdrueckte Row wird NICHT benachrichtigt.
    expect(gesehen).toEqual([['p-cross', 'freigegeben']])
  })

  it('Suppression-Gate erhaelt NUR die release-berechtigten Rows (nicht Storno/Hold)', async () => {
    let erhalten: string[] = []
    const db = fakeDb({
      pending: [
        pendingRow({ id: 'p-release', claim_id: 'c1' }),
        pendingRow({ id: 'p-storno', claim_id: 'c-storno' }),
        pendingRow({ id: 'p-hold', claim_id: 'c-hold' }),
      ],
      claims: [
        abgeschlossenerClaim(),
        abgeschlossenerClaim({ id: 'c-storno', operative_status: 'storniert', abgeschlossen_am: null }),
        abgeschlossenerClaim({ id: 'c-hold', operative_status: 'sv-termin', abgeschlossen_am: null }),
      ],
    })

    const r = await runProvisionsRelease(db, {
      partnerTypen: RELEASE_PARTNER_TYPEN,
      now: NOW,
      bestimmeUnterdrueckteProvisionen: async (rows) => { erhalten = rows.map((p) => p.id); return new Set() },
    })

    if (!r.ok) throw new Error(r.error)
    expect(erhalten).toEqual(['p-release'])
    expect(r.storniert).toBe(1)
    expect(r.released).toBe(1)
    expect(r.unterdrueckt).toBe(0)
  })

  it('Suppression-Hook wirft -> fail-open: alles freigegeben (Status quo), Lauf bricht nicht', async () => {
    const db = fakeDb({ pending: [pendingRow()], claims: [abgeschlossenerClaim()] })

    const r = await runProvisionsRelease(db, {
      partnerTypen: RELEASE_PARTNER_TYPEN,
      now: NOW,
      bestimmeUnterdrueckteProvisionen: async () => { throw new Error('graph down') },
    })

    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(1)
    expect(r.unterdrueckt).toBe(0)
    expect(db._updates).toContainEqual({
      table: 'partner_provisionen',
      patch: { status: 'freigegeben' },
      ids: ['p1'],
    })
  })

  it('ohne bestimmeUnterdrueckteProvisionen: Verhalten unveraendert (alles freigegeben)', async () => {
    const db = fakeDb({ pending: [pendingRow({ id: 'p1', partner_typ: 'werkstatt' })], claims: [abgeschlossenerClaim()] })
    const r = await runProvisionsRelease(db, { partnerTypen: RELEASE_PARTNER_TYPEN, now: NOW })
    if (!r.ok) throw new Error(r.error)
    expect(r.released).toBe(1)
    expect(r.unterdrueckt).toBe(0)
  })
})
