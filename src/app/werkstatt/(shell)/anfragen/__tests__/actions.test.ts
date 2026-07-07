// Tests fuer die Anfragen-Flow-Push-Actions (Lead-basiert): Ownership-Gate (v_werkstatt_lead
// 0-Row), Kanal-Wahl (WhatsApp->Email-Fallback) + Delegation an die Flow-Link-Helper.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  owned: { id: 'l1', telefon: '+4915100000000', email: 'k@x.de' } as Record<string, unknown> | null,
  send: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('@/lib/auth/portal-guard', () => ({
  requirePortalAccess: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/werkstatt/schadentyp-options', () => ({ SCHADENTYP_VALUES: [] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({
  sendFlowLinkMultiChannelCore: (...args: unknown[]) => h.send(...args),
}))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: (...args: unknown[]) => h.ensure(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'actor1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockImplementation(async () => ({ data: h.owned })),
        })),
      })),
    })),
  }),
}))

beforeEach(() => {
  h.owned = { id: 'l1', telefon: '+4915100000000', email: 'k@x.de' }
  h.send.mockReset().mockResolvedValue({ success: true })
  h.ensure.mockReset().mockResolvedValue({ ok: true, token: 'tok1' })
})

describe('resendeAnfrageFlowLink', () => {
  it('Ownership + Telefon -> WhatsApp, ok:true', async () => {
    const { resendeAnfrageFlowLink } = await import('../actions')
    const r = await resendeAnfrageFlowLink('l1')
    expect(r.ok).toBe(true)
    expect(r.kanal).toBe('whatsapp')
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][1]).toBe('l1') // leadId direkt (kein Claim-Resolve)
  })

  it('RLS-0-Row -> ok:false, kein Send', async () => {
    h.owned = null
    const { resendeAnfrageFlowLink } = await import('../actions')
    const r = await resendeAnfrageFlowLink('fremd')
    expect(r.ok).toBe(false)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('kein Kontaktkanal -> ok:false', async () => {
    h.owned = { id: 'l1', telefon: null, email: null }
    const { resendeAnfrageFlowLink } = await import('../actions')
    const r = await resendeAnfrageFlowLink('l1')
    expect(r.ok).toBe(false)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('WhatsApp scheitert + Email vorhanden -> Fallback Email, ok:true', async () => {
    h.send.mockReset()
      .mockResolvedValueOnce({ success: false, error: 'wa down' })
      .mockResolvedValueOnce({ success: true })
    const { resendeAnfrageFlowLink } = await import('../actions')
    const r = await resendeAnfrageFlowLink('l1')
    expect(r.ok).toBe(true)
    expect(r.kanal).toBe('email')
    expect(h.send).toHaveBeenCalledTimes(2)
  })
})

describe('oeffneAnfrageFlow', () => {
  it('Ownership + FlowLink ok -> ok:true + /flow/<token>-URL', async () => {
    const { oeffneAnfrageFlow } = await import('../actions')
    const r = await oeffneAnfrageFlow('l1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toContain('/flow/tok1')
  })

  it('RLS-0-Row -> ok:false', async () => {
    h.owned = null
    const { oeffneAnfrageFlow } = await import('../actions')
    const r = await oeffneAnfrageFlow('fremd')
    expect(r.ok).toBe(false)
  })
})
