import { describe, it, expect, vi, beforeEach } from 'vitest'

// Storage-RLS-Rest: Sicherheits-Contract der Doku-Signing-Actions.
//
// Hintergrund: Alle Doc-Buckets sind privat. Der User-Client kann dort nicht
// signieren (createSignedUrl -> null), der Service-Client schon — aber der
// bypassed RLS. Daraus folgen zwei Invarianten, die diese Tests festnageln:
//
//   1. ROLLEN-GATE (deny-by-default) laeuft VOR jedem Signing. Eine
//      Server-Action ist ein eigenstaendiger POST-Endpunkt; der Layout-Guard
//      von /faelle schuetzt sie NICHT.
//   2. Der Service-Client wird AUSSCHLIESSLICH zum Signieren benutzt, NIE fuer
//      Queries. Wandert der Row-Lookup auf den Admin-Client, faellt still die
//      kanzlei-Einschraenkung aus Migration 20260421151144 weg
//      (service_typ='komplett') — die Kanzlei saehe jeden Fall. Test 'Invariante'
//      bricht, sobald jemand das tut.

let state: {
  user: { id: string } | null
  rolle: string
  rows: Array<Record<string, unknown>>
  asPath: string | null
}

const adminFrom = vi.fn()
const createAdminClientSpy = vi.fn()

/** Chainable + awaitable Query-Stub — deckt select/eq/is/order/limit ab. */
function makeQuery(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.single = vi.fn(async () => result)
  // Thenable: `await supabase.from(x).select().eq()...` resolved direkt.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

const userFrom = vi.fn((table: string) => {
  if (table === 'profiles') {
    return makeQuery({ data: { rolle: state.rolle, vorname: null, nachname: null } })
  }
  if (table === 'fall_dokumente') {
    // getAnschlussschreibenUrl liest genau eine Zeile (maybeSingle).
    return makeQuery({
      data: state.asPath !== null ? { storage_path: state.asPath } : state.rows,
      error: null,
    })
  }
  return makeQuery({ data: null, error: null })
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => userFrom(t),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    createAdminClientSpy()
    return { from: adminFrom, storage: { from: vi.fn() } }
  },
}))

vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: vi.fn(async (_c: unknown, _b: string, p: string) => (p ? `signed:${p}` : null)),
  getStorageUrlBulk: vi.fn(async (_c: unknown, items: Array<{ path: string | null }>) =>
    items.map((i) => (i.path ? `signed:${i.path}` : null)),
  ),
}))

import { listFallDokumenteMitUrls, getAnschlussschreibenUrl } from '../fall-dokumente-urls'

beforeEach(() => {
  state = {
    user: { id: 'u-1' },
    rolle: 'admin',
    rows: [{ id: 'd-1', storage_path: 'faelle/f-1/a.pdf' }],
    asPath: null,
  }
  adminFrom.mockReset()
  createAdminClientSpy.mockReset()
  userFrom.mockClear()
})

describe('listFallDokumenteMitUrls — Rollen-Gate (deny-by-default)', () => {
  it.each(['kunde', 'sachverstaendiger', 'werkstatt', 'makler'])(
    'externe Rolle "%s" wird abgewiesen — und es wird NICHT signiert',
    async (rolle) => {
      state.rolle = rolle
      const res = await listFallDokumenteMitUrls('f-1')
      expect(res.ok).toBe(false)
      // Kein Service-Client angefasst => kein RLS-Bypass versucht.
      expect(createAdminClientSpy).not.toHaveBeenCalled()
    },
  )

  it('nicht angemeldet -> abgewiesen', async () => {
    state.user = null
    const res = await listFallDokumenteMitUrls('f-1')
    expect(res.ok).toBe(false)
    expect(createAdminClientSpy).not.toHaveBeenCalled()
  })

  it('fehlende fallId -> abgewiesen (kein Full-Table-Read)', async () => {
    const res = await listFallDokumenteMitUrls('')
    expect(res.ok).toBe(false)
    expect(createAdminClientSpy).not.toHaveBeenCalled()
  })

  it.each(['admin', 'kundenbetreuer', 'kanzlei', 'dispatch'])(
    'interne Rolle "%s" bekommt signierte URLs',
    async (rolle) => {
      state.rolle = rolle
      const res = await listFallDokumenteMitUrls('f-1')
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.dokumente).toHaveLength(1)
        expect(res.dokumente[0].url).toBe('signed:faelle/f-1/a.pdf')
      }
    },
  )
})

describe('Invariante: Service-Client signiert nur, er fragt nicht ab', () => {
  it('der Row-Lookup laeuft auf dem USER-Client (RLS bleibt das Gate)', async () => {
    const res = await listFallDokumenteMitUrls('f-1')
    expect(res.ok).toBe(true)

    // fall_dokumente wurde ueber den User-Client gelesen ...
    expect(userFrom).toHaveBeenCalledWith('fall_dokumente')
    // ... und der Admin-Client hat NIE eine Query gefahren.
    // Bricht dieser Assert, verliert die Rolle `kanzlei` still ihre
    // service_typ='komplett'-Einschraenkung (Migration 20260421151144).
    expect(adminFrom).not.toHaveBeenCalled()
  })
})

describe('getAnschlussschreibenUrl', () => {
  it('externe Rolle abgewiesen', async () => {
    state.rolle = 'kunde'
    state.asPath = 'faelle/f-1/anschlussschreiben_1.pdf'
    const res = await getAnschlussschreibenUrl('f-1')
    expect(res.ok).toBe(false)
    expect(createAdminClientSpy).not.toHaveBeenCalled()
  })

  it('interne Rolle -> signierte URL aus dem DB-Pfad (nie aus Caller-Input)', async () => {
    state.asPath = 'faelle/f-1/anschlussschreiben_1.pdf'
    const res = await getAnschlussschreibenUrl('f-1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe('signed:faelle/f-1/anschlussschreiben_1.pdf')
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('kein Anschlussschreiben hinterlegt -> sauberer Fehler statt leerer URL', async () => {
    state.asPath = ''
    const res = await getAnschlussschreibenUrl('f-1')
    expect(res.ok).toBe(false)
  })
})
