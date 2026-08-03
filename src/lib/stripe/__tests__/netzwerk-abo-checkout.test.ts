import { describe, it, expect, vi } from 'vitest'

// Der stripe-Singleton (client.ts) instanziiert beim Modul-Load mit STRIPE_SECRET_KEY —
// im Test-Env nicht gesetzt -> Konstruktor wirft. Seiteneffekt-Module mocken; der
// getestete Params-Builder ist pure und braucht keins davon.
vi.mock('../client', () => ({ stripe: {} }))
vi.mock('../sv-checkout', () => ({ getOrCreateStripeCustomer: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/billing/netzwerk-preise', () => ({ ladeNetzwerkPreise: vi.fn() }))

import { buildNetzwerkAboCheckoutParams } from '../netzwerk-abo-checkout'

describe('buildNetzwerkAboCheckoutParams', () => {
  const p = buildNetzwerkAboCheckoutParams({
    customerId: 'cus_1',
    svId: 'sv-uuid',
    monatCent: 2999,
    setupCent: 3990,
    returnUrl: 'https://app.claimondo.de/gutachter/einstellungen?netzwerk_abo=success&session_id={CHECKOUT_SESSION_ID}',
  })

  it('mode=subscription, kein payment_method_types (Dynamic PM)', () => {
    expect(p.mode).toBe('subscription')
    expect('payment_method_types' in p).toBe(false)
  })

  it('recurring monatlich via inline price_data (kein price_-Objekt)', () => {
    const li = p.line_items![0] as {
      price_data: { unit_amount: number; recurring: { interval: string }; currency: string }
    }
    expect(li.price_data.unit_amount).toBe(2999)
    expect(li.price_data.currency).toBe('eur')
    expect(li.price_data.recurring.interval).toBe('month')
  })

  it('Setup-Fee als add_invoice_items der ERSTEN Rechnung (config-cent, inline)', () => {
    const aii = (
      (p.subscription_data as unknown as { add_invoice_items: Array<{ price_data: { unit_amount: number } }> })
        .add_invoice_items
    )[0]
    expect(aii.price_data.unit_amount).toBe(3990)
  })

  it('sv_id in subscription_data.metadata UND session.metadata (Resolver-Anker)', () => {
    expect(p.subscription_data!.metadata!.sv_id).toBe('sv-uuid')
    expect(p.subscription_data!.metadata!.typ).toBe('netzwerk_abo')
    expect(p.metadata!.sv_id).toBe('sv-uuid')
    expect(p.metadata!.typ).toBe('netzwerk_abo')
  })

  it('setupCent=0 => KEINE add_invoice_items (Waiver/Sonderfall)', () => {
    const p0 = buildNetzwerkAboCheckoutParams({
      customerId: 'c', svId: 's', monatCent: 2999, setupCent: 0, returnUrl: 'x',
    })
    const aii = (p0.subscription_data as unknown as { add_invoice_items?: unknown[] }).add_invoice_items
    expect(aii ?? []).toHaveLength(0)
  })
})
