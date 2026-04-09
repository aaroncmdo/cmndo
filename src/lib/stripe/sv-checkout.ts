import type Stripe from 'stripe'
import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

/**
 * KFZ-148: Stripe Customer anlegen oder bestehenden holen.
 */
export async function getOrCreateStripeCustomer(gutachterId: string): Promise<string> {
  const db = createAdminClient()
  const { data: sv } = await db.from('sachverstaendige')
    .select('stripe_customer_id, profile_id')
    .eq('id', gutachterId)
    .single()

  if (sv?.stripe_customer_id) return sv.stripe_customer_id

  // Profil laden für Email + Name
  let email = ''
  let name = ''
  if (sv?.profile_id) {
    const { data: p } = await db.from('profiles').select('email, vorname, nachname').eq('id', sv.profile_id).single()
    if (p) {
      email = p.email ?? ''
      name = [p.vorname, p.nachname].filter(Boolean).join(' ')
    }
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { gutachter_id: gutachterId },
  })

  await db.from('sachverstaendige').update({ stripe_customer_id: customer.id }).eq('id', gutachterId)
  return customer.id
}

/**
 * KFZ-148 / KFZ-156: Stripe Checkout Session für SV-Anzahlung erstellen.
 *
 * KFZ-156: Auf ui_mode='embedded' umgestellt — der Checkout laeuft jetzt
 * INLINE im Willkommen-Flow (Step 3) statt in einer hosted Stripe-Page.
 * Wir geben jetzt einen client_secret zurueck statt einer URL, der Browser
 * mountet damit <EmbeddedCheckout />.
 */
export async function createStripeCheckoutSession(gutachterId: string): Promise<{ clientSecret: string; sessionId: string }> {
  const db = createAdminClient()
  const { data: sv } = await db.from('sachverstaendige')
    .select('onboarding_anzahlung_betrag, paket')
    .eq('id', gutachterId)
    .single()

  if (!sv) throw new Error('SV nicht gefunden')

  const betrag = Number(sv.onboarding_anzahlung_betrag ?? 0)
  if (betrag <= 0) throw new Error('Kein Anzahlungsbetrag hinterlegt')

  const customerId = await getOrCreateStripeCustomer(gutachterId)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    // KFZ-156: stripe@22 SDK-Types listen 'embedded' nicht direkt, die Stripe-API
    // akzeptiert den String aber problemlos — daher der Cast.
    ui_mode: 'embedded' as unknown as Stripe.Checkout.SessionCreateParams['ui_mode'],
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(betrag * 100), // Stripe erwartet Cent
        product_data: {
          name: `Claimondo Paket-Anzahlung (${sv.paket ?? 'Standard'})`,
          description: 'Einmalige Vorauszahlung gemäß §4 Kooperationsvertrag. Wird mit den ersten Lead-Gebühren verrechnet.',
        },
      },
      quantity: 1,
    }],
    metadata: {
      gutachter_id: gutachterId,
      typ: 'sv_anzahlung',
    },
    // KFZ-156: return_url ersetzt success_url im embedded mode. Stripe leitet
    // nach erfolgreicher Zahlung zurueck zur Willkommen-Page mit stripe_success=1,
    // wo dann Step 4 (Logo-Upload) angezeigt wird.
    return_url: `${APP_URL}/gutachter/willkommen?stripe_success=1&session_id={CHECKOUT_SESSION_ID}`,
  })

  // Status updaten
  await db.from('sachverstaendige').update({
    onboarding_status: 'anzahlung_offen',
    onboarding_anzahlung_faellig_am: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq('id', gutachterId)

  if (!session.client_secret) throw new Error('Stripe hat keinen client_secret zurueckgegeben')
  return { clientSecret: session.client_secret, sessionId: session.id }
}
