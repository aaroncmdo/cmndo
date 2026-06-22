import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { OnboardingWriteContext } from './write-context'

// CMM-49: Ownership-Gate + fall_id->claim_id-Bridge fuer kunde-onboarding-Fakten (geteilt von
// claims- und claim_parties-Handler). Der eingeloggte Kunde MUSS der Geschaedigte des Claims sein
// (geschaedigter_user_id == user.id) — scoped Permission, weil die kunde-Rolle stammdaten=read hat
// (canEditField=false). Admin-Read fuer den Vergleich; der Write passiert NACH bestandenem Check.
export async function resolveOwnedClaimId(
  ctx: OnboardingWriteContext,
): Promise<{ ok: true; claimId: string } | { ok: false; error: string }> {
  if (!ctx.user) return { ok: false, error: 'Nicht angemeldet' }
  if (!ctx.fallId) return { ok: false, error: 'Kein Fall-Kontext fuer die Fakten-Speicherung' }
  // fall_id -> claim_id (Bridge; fall_id != claim_id, MP-8b-Invariante)
  const claimId = await resolveClaimId(ctx.supabase, ctx.fallId)
  if (!claimId) return { ok: false, error: 'Kein Claim zu diesem Fall gefunden' }
  const admin = createAdminClient()
  const { data: claimRow, error: ownErr } = await admin
    .from('claims')
    .select('geschaedigter_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (ownErr) return { ok: false, error: ownErr.message }
  const ownerId = ((claimRow as { geschaedigter_user_id?: string | null } | null)?.geschaedigter_user_id) ?? null
  if (!ownerId || ownerId !== ctx.user.id) return { ok: false, error: 'Keine Berechtigung fuer diesen Fall' }
  return { ok: true, claimId }
}
