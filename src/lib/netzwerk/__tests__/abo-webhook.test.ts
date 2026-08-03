import { describe, it, expect } from 'vitest'
import { deriveAboStatusFromStripe } from '../abo-webhook'

describe('deriveAboStatusFromStripe', () => {
  it('checkout.session.completed + invoice.payment_succeeded => aktiv', () => {
    expect(deriveAboStatusFromStripe('checkout.session.completed')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('invoice.payment_succeeded')).toBe('aktiv')
  })

  it('invoice.payment_failed => ueberfaellig', () => {
    expect(deriveAboStatusFromStripe('invoice.payment_failed')).toBe('ueberfaellig')
  })

  it('customer.subscription.deleted => gekuendigt', () => {
    expect(deriveAboStatusFromStripe('customer.subscription.deleted')).toBe('gekuendigt')
  })

  it('subscription.updated mappt den Stripe-Sub-Status', () => {
    // cancel_at_period_end laesst subStatus=active -> Boost bleibt bis Perioden-Ende (aktiv),
    // erst customer.subscription.deleted (Perioden-Ende) => gekuendigt.
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'active')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'trialing')).toBe('aktiv')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'past_due')).toBe('ueberfaellig')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'unpaid')).toBe('ueberfaellig')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'canceled')).toBe('gekuendigt')
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'incomplete_expired')).toBe('gekuendigt')
  })

  it('unbekannt / irrelevant => null (No-op)', () => {
    expect(deriveAboStatusFromStripe('customer.subscription.updated', 'incomplete')).toBeNull()
    expect(deriveAboStatusFromStripe('charge.refunded')).toBeNull()
  })
})
