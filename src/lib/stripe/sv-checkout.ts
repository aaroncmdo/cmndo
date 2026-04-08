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
 * KFZ-148: Stripe Checkout Session für SV-Anzahlung erstellen.
 */
export async function createStripeCheckoutSession(gutachterId: string): Promise<{ checkoutUrl: string }> {
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
    success_url: `${APP_URL}/gutachter/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/gutachter/onboarding?step=3&cancelled=1`,
  })

  // Status updaten
  await db.from('sachverstaendige').update({
    onboarding_status: 'anzahlung_offen',
    onboarding_anzahlung_faellig_am: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq('id', gutachterId)

  return { checkoutUrl: session.url! }
}
