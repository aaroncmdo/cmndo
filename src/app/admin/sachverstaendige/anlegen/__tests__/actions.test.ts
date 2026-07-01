import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Gutachter-Onboarding-Audit (Befund #2): Admin-Anlage ist kein echter
// DB-Transaktions-Block — sie macht kompensierende Rollback-Deletes. Zwei Lücken:
//  (a) Rollback-Deletes prüften ihren EIGENEN Fehler nicht -> bei Rollback-Fail
//      bleibt ein verwaister auth.user/profiles-Eintrag zurück, still.
//  (b) Sub-Inserts in Büro/Akademie/Community destrukturierten nur `data`, nie
//      `error` -> ein fehlgeschlagener Sub-Insert wurde still ignoriert, die
//      Action gab `success:true` mit fehlenden Zeilen zurück.
// Diese Tests decken die Solo-Anlage (live genutzt) + Büro (Sub-Insert-Fail) ab.

// ─── Konfigurierbarer Admin-Client-Mock ─────────────────────────────────────
type InsertResult = { error: { message: string } | null }
type MockCfg = {
  createUser?: () => { data: { user: { id: string } } | null; error: { message: string } | null }
  deleteUser?: (id: string) => { error: { message: string } | null }
  // (table, n) => Ergebnis für den n-ten Insert in diese Tabelle (1-basiert)
  insert?: (table: string, n: number) => InsertResult
  deleteError?: (table: string) => { error: { message: string } | null }
  select?: (table: string) => { data: unknown }
}

function makeAdminDb(cfg: MockCfg) {
  let userSeq = 0
  const insertCounts: Record<string, number> = {}
  const calls = {
    deleteUser: [] as string[],
    deletes: [] as Array<{ table: string }>,
    inserts: [] as Array<{ table: string; vals: Record<string, unknown> }>,
  }
  const db = {
    calls,
    auth: {
      admin: {
        createUser: vi.fn(async () => cfg.createUser?.() ?? { data: { user: { id: `u-${++userSeq}` } }, error: null }),
        deleteUser: vi.fn(async (id: string) => {
          calls.deleteUser.push(id)
          return cfg.deleteUser?.(id) ?? { error: null }
        }),
      },
    },
    from: (table: string) => ({
      insert: (vals: Record<string, unknown>) => {
        insertCounts[table] = (insertCounts[table] ?? 0) + 1
        const res = cfg.insert?.(table, insertCounts[table]) ?? { error: null }
        calls.inserts.push({ table, vals })
        const single = async () => ({ data: res.error ? null : { id: `${table}-${insertCounts[table]}` }, error: res.error })
        // insert() ist SOWOHL direkt awaitbar ({error}, für profiles) ALS AUCH
        // .select('id').single()-verkettbar (für sachverstaendige/organisationen).
        return {
          then: (resolve: (v: { error: { message: string } | null }) => void) => resolve({ error: res.error }),
          select: () => ({ single }),
        }
      },
      delete: () => ({
        eq: async (_col: string, _val: string) => {
          calls.deletes.push({ table })
          return cfg.deleteError?.(table) ?? { error: null }
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => cfg.select?.(table) ?? { data: { id: 'org-1', name: 'Büro X', typ: 'buero', hauptansprechpartner_user_id: null } },
          single: async () => cfg.select?.(table) ?? { data: { id: 'org-1' } },
        }),
      }),
    }),
  }
  return db
}

let adminDb: ReturnType<typeof makeAdminDb>

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminDb }))

// ensureAdmin() nutzt den Server-Client: getUser -> profiles.rolle=admin
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { rolle: 'admin', vorname: 'Ad', nachname: 'Min' } }) }) }),
    }),
  })),
}))

vi.mock('@/lib/isochrone/calculate-isochrone', () => ({ calculateIsochrone: vi.fn(async () => []) }))
vi.mock('@/lib/email/google/flows', () => ({
  sendWillkommenSv: vi.fn(async () => {}),
  sendWillkommenSvAnBuero: vi.fn(async () => {}),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { anlegeSv, anlegeBuero } from '../actions'

const soloData = {
  vorname: 'Max',
  nachname: 'Mustermann',
  email: 'neu-sv@example.de',
  steuernummer: '123/456/789',
  anrede: 'Herr',
  titel: '',
  telefon: '0170',
  firmenname: 'Muster GmbH',
  rechtsform: 'GmbH',
  paket: 'standard' as const,
  gutachter_typ: 'kfz-gutachter',
  qualifikationen: [] as string[],
  spezifikationen: [] as string[],
  schadenarten: [] as string[],
  anschrift: 'Musterstr 1, 42103 Wuppertal',
  anschrift_plz: '42103',
  anschrift_lat: 51.25,
  anschrift_lng: 7.15,
  anschrift_place_id: 'place-1',
} as unknown as Parameters<typeof anlegeSv>[0]

const bueroData = {
  buero_name: 'Büro Nord',
  inhaber_email: 'inhaber@example.de',
  inhaber_vorname: 'In',
  inhaber_nachname: 'Haber',
  sub_standorte: [
    {
      name: 'Filiale 1',
      sub_email: 'filiale1@example.de',
      sub_vorname: 'Fi',
      sub_nachname: 'Liale',
      anschrift: 'Filialstr 2, 42103 Wuppertal',
      anschrift_plz: '42103',
      anschrift_lat: 51.26,
      anschrift_lng: 7.16,
      paket: 'standard' as const,
    },
  ],
} as unknown as Parameters<typeof anlegeBuero>[0]

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errSpy.mockRestore()
})

describe('anlegeSv (Solo) — Rollback-Robustheit', () => {
  it('Happy Path: legt an, KEIN Rollback-Delete', async () => {
    adminDb = makeAdminDb({})
    const res = await anlegeSv(soloData)
    expect(res.success).toBe(true)
    expect(adminDb.calls.deleteUser).toHaveLength(0)
    expect(adminDb.calls.deletes).toHaveLength(0)
  })

  it('sachverstaendige-Insert schlägt fehl -> Rollback (profile+auth) + Fehler', async () => {
    adminDb = makeAdminDb({ insert: (t) => ({ error: t === 'sachverstaendige' ? { message: 'sv boom' } : null }) })
    const res = await anlegeSv(soloData)
    expect(res.success).toBe(false)
    // profile + auth müssen zurückgerollt werden
    expect(adminDb.calls.deletes.some((d) => d.table === 'profiles')).toBe(true)
    expect(adminDb.calls.deleteUser).toHaveLength(1)
  })

  it('scheitert AUCH der Rollback-Delete -> ORPHAN wird geloggt (nicht verschluckt)', async () => {
    adminDb = makeAdminDb({
      insert: (t) => ({ error: t === 'sachverstaendige' ? { message: 'sv boom' } : null }),
      deleteUser: () => ({ error: { message: 'delete boom' } }),
      deleteError: (t) => ({ error: t === 'profiles' ? { message: 'delete boom' } : null }),
    })
    const res = await anlegeSv(soloData)
    expect(res.success).toBe(false)
    const logged = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(logged).toContain('ORPHAN')
  })
})

describe('anlegeBuero — Sub-Insert-Fehler nicht mehr still', () => {
  it('Sub-sachverstaendige-Insert (2. SV-Insert) schlägt fehl -> success:false statt stiller Erfolg', async () => {
    // 1. sachverstaendige-Insert = Inhaber (ok), 2. = Sub-Standort (fail)
    adminDb = makeAdminDb({ insert: (t, n) => ({ error: t === 'sachverstaendige' && n === 2 ? { message: 'sub-sv boom' } : null }) })
    const res = await anlegeBuero(bueroData)
    expect(res.success).toBe(false)
  })
})
