import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingWriteContext } from './write-context'

// CMM-49: SV-Basic-Ownership-Gate (geteilt von profiles- + sachverstaendige-Handler). Der
// eingeloggte user MUSS der SV sein (sachverstaendige.profile_id == user.id) UND paket='basic'
// (Mass-Assignment-/Privilege-Guard). 1:1 aus speichereSvOnboardingStep.
export async function resolveSvBasic(
  ctx: OnboardingWriteContext,
): Promise<{ ok: true; svId: string; userId: string } | { ok: false; error: string }> {
  if (!ctx.user) return { ok: false, error: 'Nicht angemeldet.' }
  const admin = createAdminClient()
  const { data: sv } = await admin
    .from('sachverstaendige')
    .select('id, paket')
    .eq('profile_id', ctx.user.id)
    .maybeSingle()
  if (!sv || (sv as { paket?: string }).paket !== 'basic') {
    return { ok: false, error: 'Kein Basic-Onboarding fuer dieses Konto.' }
  }
  return { ok: true, svId: (sv as { id: string }).id, userId: ctx.user.id }
}
