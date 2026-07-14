import { describe, it, expect, vi, beforeEach } from 'vitest'

// Ein uniformer, thenable Query-Builder: jede Kette (.select().eq().maybeSingle() /
// .update().eq().is().select()) landet am selben Ergebnis-Objekt.
const filters: Array<[string, unknown]> = []
const updates: Array<Record<string, unknown>> = []
const state = {
  row: null as Record<string, unknown> | null,
  casTrifftZeilen: 1, // wie viele Zeilen das CAS-UPDATE trifft
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'update', 'in', 'lt']) {
        b[m] = (...args: unknown[]) => {
          if (m === 'eq' || m === 'is') filters.push([args[0] as string, args[1]])
          if (m === 'update') updates.push(args[0] as Record<string, unknown>)
          return b
        }
      }
      b.maybeSingle = async () => ({ data: state.row, error: null })
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: state.casTrifftZeilen > 0 ? [{ id: 'i1' }] : [],
          error: null,
        })
      return b
    },
  }),
}))

vi.mock('@/lib/whatsapp/send-sms-plain', () => ({
  normalizeE164: (t: string) => t,
  sendPlainSms: async () => ({ success: true }),
}))

beforeEach(() => {
  filters.length = 0
  updates.length = 0
  state.row = null
  state.casTrifftZeilen = 1
})

async function gueltigeRow(overrides: Record<string, unknown> = {}) {
  const { generateAirdropToken } = await import('../token')
  const { token, tokenHash, lookupPrefix } = generateAirdropToken()
  state.row = {
    id: 'i1',
    claim_id: 'c1',
    status: 'offen',
    responded_at: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    token_hash: tokenHash,
    token_lookup_prefix: lookupPrefix,
    ...overrides,
  }
  return token
}

describe('resolveInviteToken', () => {
  it('findet den Invite ueber den Prefix und verifiziert per Hash', async () => {
    const token = await gueltigeRow()
    const { resolveInviteToken } = await import('../gegner-invite')
    const ctx = await resolveInviteToken(token)

    expect(ctx).toMatchObject({ inviteId: 'i1', claimId: 'c1', abgelaufen: false, bereitsBestaetigt: false })
    const { airdropLookupPrefix } = await import('../token')
    expect(filters).toContainEqual(['token_lookup_prefix', airdropLookupPrefix(token)])
  })

  it('abgelaufener Invite wird als abgelaufen markiert', async () => {
    const token = await gueltigeRow({ expires_at: new Date(Date.now() - 1000).toISOString() })
    const { resolveInviteToken } = await import('../gegner-invite')
    expect((await resolveInviteToken(token))?.abgelaufen).toBe(true)
  })

  it('schon bestaetigter Invite wird als bereitsBestaetigt gemeldet', async () => {
    const token = await gueltigeRow({ responded_at: new Date().toISOString(), status: 'daten_eingegeben' })
    const { resolveInviteToken } = await import('../gegner-invite')
    expect((await resolveInviteToken(token))?.bereitsBestaetigt).toBe(true)
  })

  it('falscher Token (Prefix trifft, Hash passt nicht) -> null', async () => {
    await gueltigeRow()
    const { generateAirdropToken } = await import('../token')
    const fremder = generateAirdropToken().token

    const { resolveInviteToken } = await import('../gegner-invite')
    expect(await resolveInviteToken(fremder)).toBeNull()
  })

  it('leerer Token -> null, ohne DB-Zugriff', async () => {
    const { resolveInviteToken } = await import('../gegner-invite')
    expect(await resolveInviteToken('  ')).toBeNull()
    expect(filters).toHaveLength(0)
  })
})

describe('bestaetigeInvite — Compare-and-Swap', () => {
  it('erster Aufruf gewinnt und filtert auf responded_at IS NULL', async () => {
    state.casTrifftZeilen = 1
    const { bestaetigeInvite } = await import('../gegner-invite')

    expect(await bestaetigeInvite('i1')).toEqual({ gewonnen: true })
    // Das CAS-Praedikat ist die Idempotenz-Garantie des ganzen Slices:
    expect(filters).toContainEqual(['responded_at', null])
    // CHECK erlaubt kein 'bestaetigt'/'accepted':
    expect(updates[0].status).toBe('daten_eingegeben')
    expect(updates[0].responded_at).toBeTruthy()
  })

  it('zweiter Aufruf verliert -> kein zweiter VS-Versand', async () => {
    state.casTrifftZeilen = 0
    const { bestaetigeInvite } = await import('../gegner-invite')
    expect(await bestaetigeInvite('i1')).toEqual({ gewonnen: false })
  })
})

describe('markiereInviteGeoeffnet', () => {
  it('setzt opened_at nur beim ERSTEN Oeffnen (chk_airdrop_responded_after_opened)', async () => {
    const { markiereInviteGeoeffnet } = await import('../gegner-invite')
    await markiereInviteGeoeffnet('i1')

    expect(updates[0].status).toBe('geoeffnet')
    expect(updates[0].opened_at).toBeTruthy()
    expect(filters).toContainEqual(['opened_at', null]) // nur wenn noch nie geoeffnet
  })
})
