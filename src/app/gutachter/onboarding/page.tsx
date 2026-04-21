import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * ARCH-1 Phase 1 (2026-04-09): Self-Service-Onboarding entfaellt.
 *
 * Diese Page ist nur noch eine Redirect-Logik:
 * - Kein SV-Eintrag → /login mit Fehler ("Aaron muss Account anlegen")
 * - vom_admin_angelegt + kein Vertrag → /gutachter/willkommen
 * - Vertrag unterzeichnet, noch nicht bezahlt → /gutachter/willkommen?step=stripe
 * - Bezahlt + freigeschaltet → /gutachter (Dashboard)
 *
 * Backwards-Compat: Bestehende Bookmarks/Links zu /gutachter/onboarding fuehren
 * jetzt automatisch zur richtigen Stelle im neuen Flow.
 */
export default async function GutachterOnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR SV-Audit-Follow-up: nur profile_id, user_id-Fallback entfernt
  const svSelect = 'id, onboarding_status, vertrag_unterschrieben, portal_zugang_freigeschaltet'
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    .maybeSingle()

  // Fall 1: kein SV-Eintrag → Aaron muss Account anlegen
  if (!sv) {
    redirect('/login?error=Dein%20Account%20ist%20noch%20nicht%20eingerichtet.%20Bitte%20kontaktiere%20Aaron%20unter%20aaron.sprafke%40claimondo.de')
  }

  // Fall 4: vollstaendig durch → Dashboard
  if (sv.portal_zugang_freigeschaltet) {
    redirect('/gutachter')
  }

  // Fall 3: Vertrag unterzeichnet aber noch nicht bezahlt → Stripe-Step
  if (sv.vertrag_unterschrieben) {
    redirect('/gutachter/willkommen?step=stripe')
  }

  // Fall 2: vom Admin angelegt, kein Vertrag → /willkommen Step 1
  redirect('/gutachter/willkommen')
}
