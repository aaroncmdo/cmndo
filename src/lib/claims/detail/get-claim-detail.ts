// src/lib/claims/detail/get-claim-detail.ts
// Phase C: EIN rollen-gescopeter Loader, der die bestehenden Claim-Loader zu einem
// ClaimDetail-Bundle komponiert (0 neue DB-Reads). Die drei Rollen-Praesentationen
// (Phase D) konsumieren dies statt je eine eigene Assembly zu orchestrieren
// (killt die ~40% Query-Dup zwischen faelle/[id] und kunde/faelle/[id]).
//
// Access-Boundary: getClaimForRole (RLS-backed, liest v_claim_full) — null =>
// notFound/kein Zugriff. Post-Gate: Sub-Entities via Admin-Client, weil
// getClaimLifecycle ALLE Sub-Entities fuer die A1-kanonische Phase braucht
// (RLS-partielle Reads => falsche Phase fuer sv/kunde). Exposure der admin-
// geladenen Sub-Entities ist rollen-gegated (no-leak-Default).
//
// Loader-Konvention: liefert ClaimDetail | null (KEIN {ok,error} — ist kein
// 'use server'). Plan: docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { Rolle } from '@/lib/claims/types'
import { getClaimForRole } from '@/lib/claims/get-claim-for-role'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimDetail } from './types'

type DbClient = SupabaseClient<Database>

export async function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: Rolle,
): Promise<ClaimDetail | null> {
  // 1) GATE (RLS-backed): kein Zugriff / nicht gefunden -> null.
  const claim = await getClaimForRole(supabase, claimId, rolle)
  if (!claim) return null

  // 2) Post-Gate: Lifecycle via Admin. getClaimLifecycle braucht ALLE Sub-Entities
  //    fuer die A1-kanonische Phase; das Gate oben hat den Zugriff bereits geprueft,
  //    die Phase ist nicht sensibler als der Claim selbst.
  const admin = createAdminClient()
  const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)

  // 3) Dokumente: eigener rollen-gescopeter Loader (gated intern via getClaimForRole).
  const pflichtDokumente = await getPflichtdokumenteForFall(supabase, claimId, rolle)

  // 4) Rollen-gescopte Exposure der admin-geladenen Sub-Entities (no-leak-Default:
  //    kein Column-Profile auf auftraege/kanzlei_faelle -> nur Staff sieht die Rohzeilen;
  //    sv/kunde bekommen die Phase via lifecycle, aber nicht die internen Rohzeilen).
  const istStaff = rolle === 'kb' || rolle === 'admin'
  return {
    rolle,
    claim,
    lifecycle,
    auftraege: istStaff ? auftraege : [],
    kanzleiFall: istStaff || rolle === 'kanzlei' ? kanzleiFall : null,
    pflichtDokumente,
  }
}
