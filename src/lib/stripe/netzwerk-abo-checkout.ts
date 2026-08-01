// P5 T3: Netzwerkpartner-Abo — Subscription-Checkout (Monats-Flatrate) mit der
// einmaligen Einrichtungsgebuehr als add_invoice_items der ERSTEN Rechnung
// (Stripe-kanonisch fuer "Setup-Fee + Abo"). Preise inline aus der Config (T2) ->
// KEINE price_/prod_-IDs. KEIN payment_method_types (Dynamic Payment Methods).
// ui_mode-Cast = Bestandsmuster (akademie-/buero-checkout, stripe@22-Type-Lag).

import type Stripe from 'stripe'
import { stripe } from './client'
import { getOrCreateStripeCustomer } from './sv-checkout'
import { ladeNetzwerkPreise } from '@/lib/billing/netzwerk-preise'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

/** Pure Params-Builder — netzfrei, unit-getestet. */
export function buildNetzwerkAboCheckoutParams(args: {
  customerId: string
  svId: string
  monatCent: number
  setupCent: number
  returnUrl: string
}): Stripe.Checkout.SessionCreateParams {
  const meta = { sv_id: args.svId, typ: 'netzwerk_abo' }
  const subscriptionData = {
    metadata: meta,
    ...(args.setupCent > 0
      ? {
          add_invoice_items: [
            {
              price_data: {
                currency: 'eur',
                unit_amount: args.setupCent,
                product_data: { name: 'Claimondo Netzwerkpartner — einmalige Einrichtungsgebühr' },
              },
              quantity: 1,
            },
          ],
        }
      : {}),
  }
  const params: Stripe.Checkout.SessionCreateParams = {
    customer: args.customerId,
    mode: 'subscription',
    // KFZ-156-Muster: embedded Checkout inline im Portal (Cast wie akademie-checkout.ts).
    ui_mode: 'embedded_page' as unknown as Stripe.Checkout.SessionCreateParams['ui_mode'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: args.monatCent,
          recurring: { interval: 'month' },
          product_data: { name: 'Claimondo Netzwerkpartner (Monatsbeitrag)' },
        },
        quantity: 1,
      },
    ],
    subscription_data: subscriptionData as Stripe.Checkout.SessionCreateParams['subscription_data'],
    metadata: meta,
    return_url: args.returnUrl,
  }
  return params
}

export async function createNetzwerkAboCheckoutSession(
  svId: string,
): Promise<{ ok: true; clientSecret: string; sessionId: string } | { ok: false; error: string }> {
  try {
    const preise = await ladeNetzwerkPreise()
    const customerId = await getOrCreateStripeCustomer(svId)
    const params = buildNetzwerkAboCheckoutParams({
      customerId,
      svId,
      monatCent: preise.monatCent,
      setupCent: preise.setupCent,
      returnUrl: `${APP_URL}/gutachter/einstellungen?netzwerk_abo=success&session_id={CHECKOUT_SESSION_ID}`,
    })
    const session = await stripe.checkout.sessions.create(params)
    if (!session.client_secret) return { ok: false, error: 'Stripe lieferte keinen client_secret' }
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id }
  } catch (err) {
    console.error('[netzwerk-abo-checkout]', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Checkout fehlgeschlagen' }
  }
}

/** Self-Service Abo-Management (Kuendigung/Zahlmethode) via Stripe Customer Portal. */
export async function createNetzwerkAboPortalSession(
  svId: string,
  returnUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const db = createAdminClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('stripe_customer_id')
      .eq('id', svId)
      .single()
    if (!sv?.stripe_customer_id) return { ok: false, error: 'Kein Stripe-Kunde hinterlegt' }
    const portal = await stripe.billingPortal.sessions.create({
      customer: sv.stripe_customer_id,
      return_url: returnUrl,
    })
    return { ok: true, url: portal.url }
  } catch (err) {
    console.error('[netzwerk-abo-portal]', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Portal-Session fehlgeschlagen' }
  }
}
