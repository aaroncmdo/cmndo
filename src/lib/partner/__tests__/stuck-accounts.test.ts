import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findStuckPartnerAccounts, EXTERNE_PARTNER_ROLLEN } from '../stuck-accounts'

type Prof = {
  id: string
  email: string | null
  rolle: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  created_at: string | null
}

// Mock: profiles-Query ist chainbar (select/eq/in/lt -> selbes Objekt, am Ende thenable)
// PLUS auth.admin.getUserById fuer den Login-Status. loginAt bildet id -> last_sign_in_at ab;
// fehlt eine id, gilt sie als NIE eingeloggt.
function mockAdmin(opts: {
  profiles?: Prof[] | null
  profilesError?: { message: string } | null
  loginAt?: Record<string, string | null>
  getUserByIdError?: { message: string } | null
}): SupabaseClient {
  const p = Promise.resolve({ data: opts.profiles ?? null, error: opts.profilesError ?? null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt']) chain[m] = () => chain
  chain.then = p.then.bind(p)
  chain.catch = p.catch.bind(p)
  chain.finally = p.finally.bind(p)
  return {
    from: () => chain,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, last_sign_in_at: opts.loginAt?.[id] ?? null } },
          error: opts.getUserByIdError ?? null,
        }),
      },
    },
  } as unknown as SupabaseClient
}

const P = (id: string, rolle: string, email: string | null = `${id}@extern.de`): Prof => ({
  id,
  email,
  rolle,
  vorname: `Firma ${id}`,
  nachname: null,
  telefon: `+4917000000${id}`,
  created_at: '2026-06-01T00:00:00Z',
})

describe('findStuckPartnerAccounts', () => {
  it('liefert nie-eingeloggte Partner inkl. Kontaktdaten', async () => {
    const res = await findStuckPartnerAccounts(mockAdmin({ profiles: [P('a', 'werkstatt', 'w@extern.de')] }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner).toHaveLength(1)
    expect(res.partner[0]).toMatchObject({
      userId: 'a',
      email: 'w@extern.de',
      rolle: 'werkstatt',
      telefon: '+4917000000a',
      seit: '2026-06-01T00:00:00Z',
      name: 'Firma a',
    })
  })

  it('schliesst bereits eingeloggte Kandidaten aus', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({ profiles: [P('a', 'werkstatt'), P('b', 'makler')], loginAt: { b: '2026-06-05T10:00:00Z' } }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner.map((x) => x.userId)).toEqual(['a'])
  })

  it('schliesst interne/Test-Identitaeten aus (istInterneEmail)', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({
        profiles: [
          P('intern', 'kundenbetreuer', 'kb@claimondo.de'),
          P('smoke', 'werkstatt', 'smoke-x@claimondo.test'),
          P('echt', 'werkstatt', 'info@echte-werkstatt.de'),
        ],
      }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner.map((x) => x.userId)).toEqual(['echt'])
  })

  it('getUserById-Fehler -> Kandidat defensiv ueberspringen (kein Fehlalarm)', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({ profiles: [P('a', 'werkstatt')], getUserByIdError: { message: 'auth down' } }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner).toEqual([])
  })

  it('DB-Fehler -> ok:false mit Meldung (kein throw, kein stilles Leer)', async () => {
    const res = await findStuckPartnerAccounts(mockAdmin({ profiles: null, profilesError: { message: 'boom' } }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('boom')
  })

  it('EXTERNE_PARTNER_ROLLEN enthaelt kundenbetreuer NICHT', () => {
    expect(EXTERNE_PARTNER_ROLLEN).toEqual(['werkstatt', 'makler', 'sachverstaendiger'])
  })
})
