// Finder-READ-Resolver der Netzwerk-Bindung (Design §8, WS-A): welcher Owner-Knoten gehoert
// zu diesem Claim? ANDERS als owner-resolution.ts (Seed-Seite: Vermittler-Entity -> Profil bei
// Anlage) — hier wird die BEREITS GESEEDETE Bindung gelesen, mit Praezedenz
//   per-Claim (claims.netzwerk_owner_id) > Kunden-Default (profiles.netzwerk_owner_id) > null.
// Liefert eine profiles.id (Owner-Knoten) — KEIN Entity-Id. admin = service-role.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveNetzwerkOwnerProfilId(
  admin: SupabaseClient,
  input: { claimId: string },
): Promise<string | null> {
  const { data: claim } = await admin
    .from('claims')
    .select('netzwerk_owner_id, geschaedigter_user_id')
    .eq('id', input.claimId)
    .maybeSingle()
  const perClaim = (claim as { netzwerk_owner_id: string | null } | null)?.netzwerk_owner_id ?? null
  if (perClaim) return perClaim
  const kundeId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id ?? null
  if (!kundeId) return null
  const { data: prof } = await admin
    .from('profiles')
    .select('netzwerk_owner_id')
    .eq('id', kundeId)
    .maybeSingle()
  return (prof as { netzwerk_owner_id: string | null } | null)?.netzwerk_owner_id ?? null
}
