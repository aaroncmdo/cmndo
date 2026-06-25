'use server'

// CMM-49 Onboarding-Writer-Kanonisierung: SV-Onboarding-Step-Save -> duenner Wrapper ueber
// saveOnboardingFields (audience='sv'). Die profiles- + sachverstaendige-Handler machen je das
// SV-Basic-Gate (sachverstaendige.profile_id == user.id + paket='basic') + Whitelist
// (PROFILE_WHITELIST / SV_WHITELIST, Mass-Assignment-Guard) + write. felder kommen vom WizardClient
// (DB-geseedete sv-onboarding-Phasen). _finalize/_self bleiben Sache des WizardClient (Router skippt sie).

import { createClient } from '@/lib/supabase/server'
import { saveOnboardingFields } from '@/lib/onboarding/save-onboarding-fields'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from '@/lib/onboarding/write-context'

export async function speichereSvOnboardingStep(
  _phaseKey: string,
  values: Record<string, unknown>,
  felder: OnboardingFeld[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ctx: OnboardingWriteContext = {
    supabase,
    user: user ? { id: user.id } : null,
    audience: 'sv',
  }
  const r = await saveOnboardingFields(ctx, felder, values)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true }
}
