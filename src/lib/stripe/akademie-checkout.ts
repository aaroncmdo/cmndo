import type Stripe from 'stripe'
import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

/**
 * KFZ-152 Phase 2: Stripe Customer fuer eine Akademie anlegen oder holen.
 * Analog zum Buero-Pattern (parent_stripe_customer_id auf der Org). Die
 * Akademie zahlt einmalig EINE individuell festgelegte Anzahlung; spaetere
 * Sammelabrechnungen ziehen wieder gegen den selben Customer (off_session).
 */
export async function getOrCreateAkademieStripeCustomer(organisationId: string): Promise<string> {
  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('parent_stripe_customer_id, name, hauptansprechpartner_user_id, typ')
    .eq('id', organisationId)
    .single()

  if (!org) throw new Error('Organisation nicht gefunden')
  if (org.typ !== 'akademie') throw new Error('Organisation ist keine Akademie')
  if (org.parent_stripe_customer_id) return org.parent_stripe_customer_id

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
    metadata: { organisation_id: organisationId, typ: 'akademie' },
  })

  await db.from('organisationen').update({
    parent_stripe_customer_id: customer.id,
  }).eq('id', organisationId)

  return customer.id
}

/**
 * KFZ-152 Phase 2 / KFZ-156: Embedded Stripe Checkout fuer Akademie-Erst-
 * Anzahlung. Im Gegensatz zum Buero-Modell (sum aller Sub-Anzahlungen) ist
 * die Akademie-Anzahlung individuell auf der Org gesetzt
 * (organisationen.akademie_erst_anzahlung_eur, vom Admin im Wizard befuellt).
 */
export async function createAkademieCheckoutSession(organisationId: string): Promise<{ clientSecret: string; sessionId: string }> {
  const db = createAdminClient()

  const { data: org } = await db.from('organisationen')
    .select('id, name, typ, akademie_erst_anzahlung_eur')
    .eq('id', organisationId)
    .single()

  if (!org) throw new Error('Organisation nicht gefunden')
  if (org.typ !== 'akademie') throw new Error('Organisation ist keine Akademie')

  const betrag = Number(org.akademie_erst_anzahlung_eur ?? 0)
  if (betrag <= 0) throw new Error('Akademie-Erst-Anzahlung ist 0 oder nicht gesetzt')

  const customerId = await getOrCreateAkademieStripeCustomer(organisationId)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    ui_mode: 'embedded_page' as unknown as Stripe.Checkout.SessionCreateParams['ui_mode'],
    payment_intent_data: {
      setup_future_usage: 'off_session',
    },
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(betrag * 100),
        product_data: {
          name: `Claimondo Akademie-Anzahlung — ${org.name}`,
          description: 'Erst-Anzahlung der Akademie. Wird mit den ersten Lead-Gebuehren der Akademie-Mitglieder verrechnet. §4 Akademie-Kooperation.',
        },
      },
      quantity: 1,
    }],
    metadata: {
      organisation_id: organisationId,
      typ: 'akademie_anzahlung',
    },
    return_url: `${APP_URL}/gutachter/willkommen?stripe_success=1&session_id={CHECKOUT_SESSION_ID}`,
  })

  await db.from('organisationen').update({
    onboarding_status: 'anzahlung_offen',
    updated_at: new Date().toISOString(),
  }).eq('id', organisationId)

  if (!session.client_secret) throw new Error('Stripe hat keinen client_secret zurueckgegeben')
  return { clientSecret: session.client_secret, sessionId: session.id }
}
