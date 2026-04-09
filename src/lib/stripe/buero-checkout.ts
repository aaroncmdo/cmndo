import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

/**
 * KFZ-152: Stripe Customer fuer ein Buero anlegen oder bestehenden holen.
 * Im Gegensatz zu Solo-SVs sitzt der Customer auf der Organisation,
 * nicht auf einem einzelnen sachverstaendige-Eintrag.
 */
export async function getOrCreateBueroStripeCustomer(organisationId: string): Promise<string> {
  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('parent_stripe_customer_id, name, hauptansprechpartner_user_id')
    .eq('id', organisationId)
    .single()

  if (!org) throw new Error('Organisation nicht gefunden')
  if (org.parent_stripe_customer_id) return org.parent_stripe_customer_id

  // Email vom Inhaber
  let email = ''
  if (org.hauptansprechpartner_user_id) {
    const { data: p } = await db.from('profiles')
      .select('email')
      .eq('id', org.hauptansprechpartner_user_id)
      .single()
    if (p?.email) email = p.email
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: org.name,
    metadata: { organisation_id: organisationId, typ: 'buero' },
  })

  await db.from('organisationen').update({
    parent_stripe_customer_id: customer.id,
  }).eq('id', organisationId)

  return customer.id
}

/**
 * KFZ-152: Stripe Checkout fuer die Gesamt-Anzahlung des Bueros.
 * setup_future_usage='off_session' damit spaetere Sammelabrechnungen
 * automatisch eingezogen werden koennen.
 */
export async function createBueroCheckoutSession(organisationId: string): Promise<{ checkoutUrl: string }> {
  const db = createAdminClient()

  // Gesamt-Anzahlung als Summe aller Sub-Standort-Anzahlungen
  const { data: subSvs } = await db.from('sachverstaendige')
    .select('onboarding_anzahlung_betrag, paket')
    .eq('organisation_id', organisationId)
    .eq('rolle_in_organisation', 'mitarbeiter')

  if (!subSvs?.length) throw new Error('Keine Sub-Standorte gefunden')

  const gesamtBetrag = subSvs.reduce((sum, s) => sum + Number(s.onboarding_anzahlung_betrag ?? 0), 0)
  if (gesamtBetrag <= 0) throw new Error('Gesamt-Anzahlung ist 0')

  const { data: org } = await db.from('organisationen')
    .select('name')
    .eq('id', organisationId)
    .single()

  const customerId = await getOrCreateBueroStripeCustomer(organisationId)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_intent_data: {
      // Kartendaten fuer spaetere Sammelabrechnungen speichern
      setup_future_usage: 'off_session',
    },
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(gesamtBetrag * 100),
        product_data: {
          name: `Claimondo Buero-Anzahlung — ${org?.name ?? 'Buero'}`,
          description: `Gesamt-Anzahlung fuer ${subSvs.length} Standort(e). Wird mit den ersten Lead-Gebuehren verrechnet. §4 Kooperationsvertrag.`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      organisation_id: organisationId,
      typ: 'buero_anzahlung',
      anzahl_standorte: String(subSvs.length),
    },
    success_url: `${APP_URL}/gutachter/onboarding/buero/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/gutachter/onboarding/buero?cancelled=1`,
  })

  await db.from('organisationen').update({
    onboarding_status: 'anzahlung_offen',
    updated_at: new Date().toISOString(),
  }).eq('id', organisationId)

  return { checkoutUrl: session.url! }
}
