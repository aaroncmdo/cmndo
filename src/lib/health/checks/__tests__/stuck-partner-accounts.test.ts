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

describe('PARTNER_ROLLEN Enum-Integritaet', () => {
  it('enthaelt ausschliesslich gueltige user_role-Enum-Werte (sonst wirft die .in()-Query)', () => {
    const ungueltig = PARTNER_ROLLEN.filter((r) => !VALID_USER_ROLES.includes(r))
    expect(ungueltig).toEqual([])
  })
})

// Chainbarer, awaitbarer Supabase-Query-Mock: from().select().eq().in().lt().not()
// -> Promise({ data, error }). Reihenfolge-robust (jede Methode gibt chain zurueck).
function mockCtx(result: { data?: unknown[] | null; error?: { message: string } | null }) {
  const p = Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt', 'not']) chain[m] = () => chain
  chain.then = p.then.bind(p)
  chain.catch = p.catch.bind(p)
  chain.finally = p.finally.bind(p)
  return { supabase: { from: () => chain } } as unknown as Parameters<typeof stuckPartnerAccountsCheck.run>[0]
}

describe('stuckPartnerAccountsCheck', () => {
  it('ok wenn keine Partner haengen', async () => {
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ data: [] }))
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(0)
  })

  it('warn bei wenigen stuck Partnern — mit Rollen-Breakdown + sampleIds (Emails)', async () => {
    const rows = [
      { id: 'a', email: 'w1@x.de', rolle: 'werkstatt', created_at: '2026-06-01T00:00:00Z' },
      { id: 'b', email: 'sv1@x.de', rolle: 'sachverstaendiger', created_at: '2026-06-01T00:00:00Z' },
    ]
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ data: rows }))
    expect(res.status).toBe('warn')
    expect(res.metric).toBe(2)
    expect(res.detail).toContain('werkstatt')
    expect(res.sampleIds).toEqual(['w1@x.de', 'sv1@x.de'])
  })

  it('crit ab 5 stuck Partnern — sampleIds auf 5 gekappt', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      email: `w${i}@x.de`,
      rolle: 'werkstatt',
      created_at: '2026-06-01T00:00:00Z',
    }))
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ data: rows }))
    expect(res.status).toBe('crit')
    expect(res.metric).toBe(6)
    expect(res.sampleIds).toHaveLength(5)
  })

  it('error-Status bei DB-Fehler', async () => {
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ data: null, error: { message: 'boom' } }))
    expect(res.status).toBe('error')
    expect(res.detail).toContain('boom')
  })
})
