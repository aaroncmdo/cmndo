import { describe, it, expect, vi, beforeEach } from 'vitest'

// Steuert den I-1-Vorabcheck (bestehende netzwerk_einrichtung-Rechnung?).
let rechnungSchonDa = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'sv_onboarding_rechnungen'
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: rechnungSchonDa ? { id: 'r-alt' } : null, error: null }),
                  }),
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { profile_id: null } }) }),
            }),
          },
  }),
}))
const ladeNetzwerkPreise = vi.fn()
vi.mock('@/lib/billing/netzwerk-preise', () => ({
  ladeNetzwerkPreise: (...a: unknown[]) => ladeNetzwerkPreise(...a),
}))
const createOnboardingRechnung = vi.fn()
vi.mock('@/lib/billing/create-onboarding-rechnung', () => ({
  createOnboardingRechnung: (...a: unknown[]) => createOnboardingRechnung(...a),
}))

import { mintNetzwerkEinrichtungsRechnung } from '../abo-rechnung'

beforeEach(() => {
  ladeNetzwerkPreise.mockReset()
  createOnboardingRechnung.mockReset()
  rechnungSchonDa = false
})

describe('mintNetzwerkEinrichtungsRechnung', () => {
  it('ruft createOnboardingRechnung mit typ=netzwerk_einrichtung + setup-netto aus Config', async () => {
    ladeNetzwerkPreise.mockResolvedValue({ monatCent: 2999, setupCent: 3990, konfigId: 'k', konfigVersion: 1 })
    createOnboardingRechnung.mockResolvedValue({
      success: true, rechnung_id: 'r', rechnungs_nr: 'CM-ONB-2026-00001',
      pdf_buffer: Buffer.from(''), brutto_cent: 4748,
    })
    const res = await mintNetzwerkEinrichtungsRechnung('sv-1')
    expect(res.ok).toBe(true)
    const ctx = createOnboardingRechnung.mock.calls[0][0] as {
      typ: string; sv_id: string; netto_euro: number; paket: unknown; kontingent: number
    }
    expect(ctx.typ).toBe('netzwerk_einrichtung')
    expect(ctx.sv_id).toBe('sv-1')
    expect(ctx.netto_euro).toBe(39.9)
    expect(ctx.paket).toBeNull()
    expect(ctx.kontingent).toBe(0)
  })

  it('setupCent=0 => keine Rechnung (Waiver), createOnboardingRechnung nie gerufen', async () => {
    ladeNetzwerkPreise.mockResolvedValue({ monatCent: 2999, setupCent: 0, konfigId: 'k', konfigVersion: 1 })
    const res = await mintNetzwerkEinrichtungsRechnung('sv-1')
    expect(res.ok).toBe(true)
    expect(createOnboardingRechnung).not.toHaveBeenCalled()
  })

  it('Rechnung-Fehler wird als ok:false durchgereicht', async () => {
    ladeNetzwerkPreise.mockResolvedValue({ monatCent: 2999, setupCent: 3990, konfigId: 'k', konfigVersion: 1 })
    createOnboardingRechnung.mockResolvedValue({ success: false, error: 'boom' })
    const res = await mintNetzwerkEinrichtungsRechnung('sv-1')
    expect(res).toEqual({ ok: false, error: 'boom' })
  })

  it('I-1: bestehende netzwerk_einrichtung-Rechnung -> idempotenter Skip (kein Doppel-Mint)', async () => {
    ladeNetzwerkPreise.mockResolvedValue({ monatCent: 2999, setupCent: 3990, konfigId: 'k', konfigVersion: 1 })
    rechnungSchonDa = true
    const res = await mintNetzwerkEinrichtungsRechnung('sv-1')
    expect(res.ok).toBe(true)
    expect(createOnboardingRechnung).not.toHaveBeenCalled()
  })
})
