import { describe, it, expect } from 'vitest'
import { stuckPartnerAccountsCheck, PARTNER_ROLLEN } from '../stuck-partner-accounts'

// Gueltige user_role-Enum-Werte (Prod-DB paizkjajbuxxksdoycev, verifiziert 2026-07-03).
// PARTNER_ROLLEN wird per Supabase .in('rolle', …) direkt gegen dieses Enum gefiltert;
// ein Wert, den das Enum nicht kennt, laesst Postgres die GESAMTE Query mit
// "invalid input value for enum user_role" abweisen -> der Check erroret still
// (real passiert am 03.07. mit dem Nicht-Enum-Wert 'mitarbeiter').
const VALID_USER_ROLES = [
  'kunde',
  'sachverstaendiger',
  'admin',
  'kanzlei',
  'leadbearbeiter',
  'dispatch',
  'kundenbetreuer',
  'makler',
  'werkstatt',
]

type Prof = { id: string; email: string | null; rolle: string; created_at: string | null }

// Mock: profiles-Query (chainbar: from().select().eq().in().lt().not() -> Promise)
// PLUS auth.admin.getUserById(id) fuer den Login-Status. loginAt bildet id -> last_sign_in_at
// ab; fehlt eine id, gilt sie als NIE eingeloggt (last_sign_in_at=null).
function mockCtx(opts: {
  profiles?: Prof[] | null
  profilesError?: { message: string } | null
  loginAt?: Record<string, string | null>
  getUserByIdError?: { message: string } | null
}) {
  const p = Promise.resolve({ data: opts.profiles ?? null, error: opts.profilesError ?? null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt', 'not']) chain[m] = () => chain
  chain.then = p.then.bind(p)
  chain.catch = p.catch.bind(p)
  chain.finally = p.finally.bind(p)
  return {
    supabase: {
      from: () => chain,
      auth: {
        admin: {
          getUserById: async (id: string) => ({
            data: { user: { id, last_sign_in_at: opts.loginAt?.[id] ?? null } },
            error: opts.getUserByIdError ?? null,
          }),
        },
      },
    },
  } as unknown as Parameters<typeof stuckPartnerAccountsCheck.run>[0]
}

const P = (id: string, rolle: string, email = `${id}@x.de`): Prof => ({
  id,
  email,
  rolle,
  created_at: '2026-06-01T00:00:00Z',
})

describe('stuckPartnerAccountsCheck', () => {
  it('ok wenn keine Kandidaten', async () => {
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ profiles: [] }))
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(0)
  })

  it('ok wenn ALLE Kandidaten sich schon eingeloggt haben (last_sign_in_at gesetzt -> kein Stuck)', async () => {
    const profiles = [P('a', 'werkstatt'), P('b', 'sachverstaendiger')]
    const res = await stuckPartnerAccountsCheck.run(
      mockCtx({ profiles, loginAt: { a: '2026-06-02T10:00:00Z', b: '2026-06-03T10:00:00Z' } }),
    )
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(0)
  })

  it('flaggt NUR nie-eingeloggte Kandidaten (gemischt: 1 von 3 eingeloggt -> metric 2)', async () => {
    const profiles = [P('a', 'werkstatt'), P('b', 'werkstatt'), P('c', 'makler')]
    const res = await stuckPartnerAccountsCheck.run(
      mockCtx({ profiles, loginAt: { b: '2026-06-05T10:00:00Z' } }), // nur b hat sich eingeloggt
    )
    expect(res.status).toBe('warn')
    expect(res.metric).toBe(2)
    expect(res.sampleIds).toEqual(['a@x.de', 'c@x.de'])
  })

  it('warn bei wenigen nie-eingeloggten Partnern — mit Rollen-Breakdown + sampleIds (Emails)', async () => {
    const profiles = [P('a', 'werkstatt', 'w1@x.de'), P('b', 'sachverstaendiger', 'sv1@x.de')]
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ profiles }))
    expect(res.status).toBe('warn')
    expect(res.metric).toBe(2)
    expect(res.detail).toContain('werkstatt')
    expect(res.sampleIds).toEqual(['w1@x.de', 'sv1@x.de'])
  })

  it('crit ab 5 nie-eingeloggten Partnern — sampleIds auf 5 gekappt', async () => {
    const profiles = Array.from({ length: 6 }, (_, i) => P(String(i), 'werkstatt', `w${i}@x.de`))
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ profiles }))
    expect(res.status).toBe('crit')
    expect(res.metric).toBe(6)
    expect(res.sampleIds).toHaveLength(5)
  })

  it('error-Status bei DB-Fehler der profiles-Query', async () => {
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ profiles: null, profilesError: { message: 'boom' } }))
    expect(res.status).toBe('error')
    expect(res.detail).toContain('boom')
  })

  it('getUserById-Fehler fuer einen Kandidaten -> defensiv NICHT flaggen (kein Fehlalarm)', async () => {
    const profiles = [P('a', 'werkstatt')]
    const res = await stuckPartnerAccountsCheck.run(
      mockCtx({ profiles, getUserByIdError: { message: 'auth down' } }),
    )
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(0)
  })
})

describe('PARTNER_ROLLEN Enum-Integritaet', () => {
  it('enthaelt ausschliesslich gueltige user_role-Enum-Werte (sonst wirft die .in()-Query)', () => {
    const ungueltig = PARTNER_ROLLEN.filter((r) => !VALID_USER_ROLES.includes(r))
    expect(ungueltig).toEqual([])
  })
})
