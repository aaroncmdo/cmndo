'use server'

import { createClient } from '@/lib/supabase/server'
import { saveOnboardingFields } from '@/lib/onboarding/save-onboarding-fields'
import type { OnboardingWriteContext } from '@/lib/onboarding/write-context'
import type { OnboardingFeld, SaveOnboardingResult } from './types'

// CMM-49 Onboarding-Writer-Kanonisierung: der DynamicWizard-Writer (kunde-onboarding +
// gutachter-finden-Front) ist nur noch ein duenner Wrapper, der den Schreib-Kontext baut und an den
// EINEN saveOnboardingFields-Router delegiert. Routing/Ownership/Allowlist/Coercion liegen in den
// Per-Tabelle-Handlern: claims + claim_parties (kunde-onboarding, ownership-gated via fall_id-Bridge);
// gutachter_finder_anfragen (anon-Front, Shell-Insert + Rate-Limit).
//
// audience: fallId gesetzt -> 'kunde' (eingeloggter Geschaedigter); sonst 'anon' (gfa-Front, kein user).
// Der Router liefert die anfrageId zurueck (gfa-Shell-Insert vergibt sie -> Client-Kontinuitaet).
export async function saveOnboardingStep(
  anfrageId: string | null,
  _phaseKey: string,
  values: Record<string, unknown>,
  felder: OnboardingFeld[],
  fallId?: string | null,
): Promise<SaveOnboardingResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ctx: OnboardingWriteContext = {
    supabase,
    user: user ? { id: user.id } : null,
    audience: fallId ? 'kunde' : 'anon',
    anfrageId: anfrageId ?? null,
    fallId: fallId ?? null,
  }
  return saveOnboardingFields(ctx, felder, values)
}
