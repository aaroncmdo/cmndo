// Kunden-Bindung First-Touch (Spec 1 §8, K6). Der Kunden-Profil-Owner wird beim
// Onboarding-Abschluss (completeOnboarding, src/app/kunde/onboarding/actions.ts) aus dem
// Origin-Claim uebernommen — claims.netzwerk_owner_id (P3-Seed, convert-lead-to-claim.ts)
// traegt bereits den INBOUND-Vermittler. Wir kopieren ihn per First-Touch (IS-NULL-Guard)
// auf profiles.netzwerk_owner_id. entstanden_via/-aus_claim_id sind KEINE Anker (NULL-Writer,
// kein zuverlaessiger Schreiber) — der Origin-Claim ist der einzig verlaessliche Anker.
//
// MUSS ueber den Admin-Client (service_role) laufen: guard_profiles_netzwerk_owner_upd
// (Mig 20260729110049) erlaubt nur privilegierte Writes (service_role/admin) auf
// netzwerk_owner_id/netzwerk_owner_seit — ein normaler authenticated-Client wirft
// insufficient_privilege.
//
// Non-fatal: darf den Onboarding-Abschluss nie brechen.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function seedeKundenBindungFirstTouch(
  admin: SupabaseClient,
  kundeUserId: string,
  originClaimId: string,
): Promise<void> {
  try {
    const { data: claim } = await admin
      .from('claims')
      .select('netzwerk_owner_id')
      .eq('id', originClaimId)
      .maybeSingle()
    const ownerProfilId = (claim?.netzwerk_owner_id as string | null) ?? null
    if (!ownerProfilId) return
    await admin
      .from('profiles')
      .update({ netzwerk_owner_id: ownerProfilId, netzwerk_owner_seit: new Date().toISOString() })
      .eq('id', kundeUserId)
      .is('netzwerk_owner_id', null) // First-Touch: sticky, nie ueberschreiben (mehrere Faelle aus versch. Netzwerken)
  } catch (err) {
    console.warn('[netzwerk] seedeKundenBindungFirstTouch non-fatal:', err instanceof Error ? err.message : err)
  }
}
