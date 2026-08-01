// P5 T4: Stripe-Subscription-/Invoice-Events -> sv_netzwerk_abonnements (service-role, K1).
// Der Webhook ist der EINZIGE Writer der Abo-Row (neben Dunning-Cron/Backfill); paket wird
// NIE angefasst (K3). Idempotent via upsert onConflict sv_id (P0-Unique sv_netzwerk_abo_sv_uniq).

import type { SupabaseClient } from '@supabase/supabase-js'

export type AboStatus = 'inaktiv' | 'aktiv' | 'ueberfaellig' | 'gekuendigt' | 'comped'

type StripeEventLike = {
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Reine Ableitung Stripe-Event -> Abo-Status. null = irrelevant/No-op.
 * WICHTIG: cancel_at_period_end haelt den Sub Stripe-'active' bis Perioden-Ende
 * -> wir bleiben 'aktiv' (Boost bleibt); erst 'customer.subscription.deleted'
 * (Perioden-Ende) setzt 'gekuendigt'. Das deckt Spec 2 §7.2 ("wirkt zum
 * Perioden-Ende") ohne einen 'gekuendigt-aber-noch-gueltig'-Sonderfall ab und
 * ist konsistent mit P0 istAktivesAbo (gekuendigt => false, unabhaengig gueltig_bis).
 */
export function deriveAboStatusFromStripe(eventType: string, subStatus?: string | null): AboStatus | null {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'invoice.payment_succeeded':
      return 'aktiv'
    case 'invoice.payment_failed':
      return 'ueberfaellig'
    case 'customer.subscription.deleted':
      return 'gekuendigt'
    case 'customer.subscription.updated':
      switch (subStatus) {
        case 'active':
        case 'trialing':
          return 'aktiv'
        case 'past_due':
        case 'unpaid':
          return 'ueberfaellig'
        case 'canceled':
        case 'incomplete_expired':
          return 'gekuendigt'
        default:
          return null
      }
    default:
      return null
  }
}

/** Resolved die sv_id aus subscription-metadata ODER Fallback ueber subscription_id/customer. */
async function resolveSvId(
  db: SupabaseClient,
  obj: Record<string, unknown>,
): Promise<{ svId: string | null; subscriptionId: string | null }> {
  const meta = (obj.metadata ?? {}) as Record<string, string>
  const subscriptionId =
    typeof obj.subscription === 'string'
      ? obj.subscription
      : obj.object === 'subscription' && typeof obj.id === 'string'
        ? obj.id
        : null
  if (meta.sv_id) return { svId: meta.sv_id, subscriptionId }
  // Fallback A: bestehende Abo-Row per subscription_id.
  if (subscriptionId) {
    const { data } = await db
      .from('sv_netzwerk_abonnements')
      .select('sv_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    if (data?.sv_id) return { svId: data.sv_id as string, subscriptionId }
  }
  // Fallback B: ueber den Stripe-Customer.
  const customerId = typeof obj.customer === 'string' ? obj.customer : null
  if (customerId) {
    const { data } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (data?.id) return { svId: data.id as string, subscriptionId }
  }
  return { svId: null, subscriptionId }
}

/**
 * Wendet ein Subscription-/Invoice-Event auf die Abo-Row an (service-role, K1).
 * Idempotent: upsert onConflict sv_id. Setzt gueltig_bis = subscription.current_period_end.
 */
export async function applyNetzwerkAboEvent(
  db: SupabaseClient,
  event: StripeEventLike,
): Promise<{ acted: boolean; svId: string | null }> {
  const obj = event.data.object
  const subStatus = typeof obj.status === 'string' ? obj.status : null
  const neuStatus = deriveAboStatusFromStripe(event.type, subStatus)
  if (!neuStatus) return { acted: false, svId: null }

  const { svId, subscriptionId } = await resolveSvId(db, obj)
  if (!svId) {
    console.error('[abo-webhook] sv_id unaufloesbar', event.type)
    return { acted: false, svId: null }
  }

  // gueltig_bis aus der Subscription (ein retrieve, kein Hot-Path).
  let gueltigBis: string | null = null
  let subId = subscriptionId
  try {
    if (!subId && typeof obj.subscription === 'string') subId = obj.subscription
    if (subId) {
      const { stripe } = await import('@/lib/stripe/client')
      const sub = await stripe.subscriptions.retrieve(subId)
      // current_period_end lag in aelteren API-Versionen top-level, in neueren auf den
      // items — robust beide lesen (stripe@22-Type-Lag, Cast wie ui_mode-Bestandsmuster).
      const cpe =
        ((sub as unknown as { current_period_end?: number }).current_period_end) ??
        (sub as unknown as { items?: { data?: Array<{ current_period_end?: number }> } }).items?.data?.[0]
          ?.current_period_end
      if (cpe) gueltigBis = new Date(cpe * 1000).toISOString()
    }
  } catch (err) {
    console.error('[abo-webhook] subscription retrieve', err)
  }

  // K3: paket NIE anfassen. Nur die Abo-Row.
  const row: Record<string, unknown> = {
    sv_id: svId,
    status: neuStatus,
    stripe_subscription_id: subId,
    aktualisiert_am: new Date().toISOString(),
  }
  if (gueltigBis) row.gueltig_bis = gueltigBis
  const { error } = await db.from('sv_netzwerk_abonnements').upsert(row, { onConflict: 'sv_id' })
  if (error) {
    console.error('[abo-webhook] upsert', error.message)
    return { acted: false, svId }
  }

  // Setup-Fee-§14-Rechnung nur bei der ERSTEN Rechnung (subscription_create) — T5.
  if (event.type === 'invoice.payment_succeeded' && obj.billing_reason === 'subscription_create') {
    try {
      const { mintNetzwerkEinrichtungsRechnung } = await import('@/lib/netzwerk/abo-rechnung')
      await mintNetzwerkEinrichtungsRechnung(svId)
    } catch (err) {
      console.error('[abo-webhook] setup-rechnung', err)
    }
  }
  return { acted: true, svId }
}
