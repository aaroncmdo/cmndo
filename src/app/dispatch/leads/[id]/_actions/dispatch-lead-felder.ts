'use server'

// P2b (dispatch-config-unify): config-getriebener Dispatcher-Save fuer DispatchLeadForm.
// CMM-49 Onboarding-Writer-Kanonisierung: nur noch ein duenner Wrapper -> baut den Schreib-Kontext
// (audience='dispatcher', user-Context/RLS, leadId) und delegiert an saveOnboardingFields. Der
// leads-Handler uebernimmt SA-Lockdown + Coercion + die abgeleiteten Spalten (deriveDispatchLeadFelder)
// + Write. Allowlist/Felder serverseitig aus onboarding_felder (Client-Mapping wird NICHT vertraut).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ladeLeadErfassungLeadsFelder } from '@/lib/onboarding/lead-erfassung-allowlist'
import { saveOnboardingFields } from '@/lib/onboarding/save-onboarding-fields'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from '@/lib/onboarding/write-context'

export async function saveDispatchLeadFelder(
  leadId: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const feldMap = await ladeLeadErfassungLeadsFelder()
  const felder: OnboardingFeld[] = [...feldMap].map(([feld_key, meta]) => ({
    id: feld_key,
    phase_id: '',
    reihenfolge: 0,
    feld_key,
    typ: meta.typ as OnboardingFeld['typ'],
    label: '',
    pflicht: false,
    db_target: { tabelle: 'leads', spalte: meta.spalte },
  }))

  const ctx: OnboardingWriteContext = {
    supabase,
    user: { id: user.id },
    audience: 'dispatcher',
    leadId,
  }
  const r = await saveOnboardingFields(ctx, felder, values)
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
