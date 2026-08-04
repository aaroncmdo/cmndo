'use server'

// P5 T9: Server-Actions fuer das Netzwerkpartner-Abo (Checkout-Session + Customer-Portal).
// Auth-Guard nach Bestandsmuster (verfuegbarkeit/actions.ts): eingeloggter User ->
// sachverstaendige via profile_id aufloesen — NIE einer client-gelieferten sv_id vertrauen.
// KEIN authenticated-Write auf die Abo-Row (K1) — hier laufen nur Stripe-Aufrufe.

import { createClient } from '@/lib/supabase/server'
import {
  createNetzwerkAboCheckoutSession,
  createNetzwerkAboPortalSession,
} from '@/lib/stripe/netzwerk-abo-checkout'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

async function eingeloggterSvId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()
  return sv?.id ?? null
}

export async function starteNetzwerkAboCheckout(): Promise<
  { ok: true; clientSecret: string } | { ok: false; error: string }
> {
  const svId = await eingeloggterSvId()
  if (!svId) return { ok: false, error: 'Nicht angemeldet' }
  const res = await createNetzwerkAboCheckoutSession(svId)
  return res.ok ? { ok: true, clientSecret: res.clientSecret } : { ok: false, error: res.error }
}

export async function oeffneAboPortal(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const svId = await eingeloggterSvId()
  if (!svId) return { ok: false, error: 'Nicht angemeldet' }
  return createNetzwerkAboPortalSession(svId, `${APP_URL}/gutachter/einstellungen`)
}
