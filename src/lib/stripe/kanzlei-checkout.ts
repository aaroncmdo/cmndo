import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

/**
 * KFZ-188: Stripe Checkout Session fuer Kanzlei-Monatsabrechnung erstellen.
 * Gibt die Checkout-URL zurueck.
 */
export async function createKanzleiCheckoutSession(
  abrechnungId: string,
  token: string,
): Promise<string> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const db = createAdminClient()

  // Abrechnung laden
  const { data: abrechnung, error } = await db
    .from('kanzlei_abrechnungen')
    .select('endbetrag_brutto, rechnungsnummer, kanzlei_id')
    .eq('id', abrechnungId)
    .single()

  if (error || !abrechnung) {
    throw new Error(`Abrechnung nicht gefunden: ${abrechnungId}`)
  }

  const { data: kanzlei } = await db
    .from('kanzleien')
    .select('name, email')
    .eq('id', abrechnung.kanzlei_id)
    .single()

  const betragCents = Math.round(Number(abrechnung.endbetrag_brutto) * 100)
  const baseUrl = `${APP_URL}/kanzlei/abrechnung/${token}`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: betragCents,
          product_data: {
            name: `Claimondo Kanzlei-Abrechnung ${abrechnung.rechnungsnummer}`,
            description: `Vollmacht-Provision gemaess Kooperationsvertrag`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: kanzlei?.email ?? undefined,
    metadata: {
      typ: 'kanzlei_abrechnung',
      kanzlei_abrechnung_id: abrechnungId,
    },
    success_url: `${baseUrl}?payment=success`,
    cancel_url: `${baseUrl}?payment=cancelled`,
  })

  // Session-ID in DB speichern
  await db
    .from('kanzlei_abrechnungen')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', abrechnungId)

  if (!session.url) throw new Error('Stripe hat keine Checkout-URL zurueckgegeben')
  return session.url
}
