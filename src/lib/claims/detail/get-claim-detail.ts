// src/lib/claims/detail/get-claim-detail.ts
// Phase C: rollen-aware Facade ueber die v_claim_full-geerdeten Claim-Loader.
// (Aaron 08.07.: „das ist ja auch eine detail view aus der claim base bzw claim view".)
//   - kunde -> getKundeFallDetailRecord (Ownership via viewer{userId,email})
//   - staff -> getClaimForRole (v_claim_full; admin/kb='*' vollstaendig; RLS-Gate)
// + Sub-Entity-Bundle (lifecycle/auftraege/kanzleiFall/pflicht), rollen-gescoped.
// 0 neue DB-Reads (reine Komposition existierender, live Loader). Liefert
// ClaimDetail | null (Loader-Konvention, KEIN {ok,error} — ist kein 'use server').
//
// Plan: docs/superpowers/plans/2026-07-08-claim-C-getClaimDetail-loader.md
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { Rolle } from '@/lib/claims/types'
import { getClaimForRole } from '@/lib/claims/get-claim-for-role'
import { getKundeFallDetailRecord } from '@/lib/claims/get-kunde-faelle'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimDetail } from './types'

type DbClient = SupabaseClient<Database>

export async function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: Rolle,
  viewer?: { userId: string; email: string | null },
): Promise<ClaimDetail | null> {
  // Post-Gate-Loads (Lifecycle/Dokumente) laufen via Admin — getClaimLifecycle
  // braucht ALLE Sub-Entities fuer die A1-kanonische Phase; der jeweilige Core-
  // Loader unten prueft den Zugriff (RLS bzw. Ownership) und ist das Gate.
  const admin = createAdminClient()

  if (rolle === 'kunde') {
    // Kunde: ownership-aufloesender Detail-Loader (liest v_claim_full-Anker +
    // claims-SSoT-Extras + Sub-Entities → flaches Legacy-Alias-Record, das die
    // Kunde-Sub-Components 1:1 konsumieren). Braucht viewer — die Kunde-Page hat
    // den User-Kontext (claim_parties/kunde_id/lead.email-Ownership).
    if (!viewer) return null
    const core = await getKundeFallDetailRecord(admin, viewer.userId, viewer.email, claimId)
    if (!core) return null
    const { lifecycle } = await getClaimLifecycleForClaim(admin, claimId)
    const pflichtDokumente = await getPflichtdokumenteForFall(supabase, claimId, 'kunde')
    // Kunde: keine Sub-Entity-Rohzeilen (no-leak); die Phase kommt via lifecycle.
    return { rolle: 'kunde', core, lifecycle, auftraege: [], kanzleiFall: null, pflichtDokumente }
  }

  // staff/sv: RLS-Gate via getClaimForRole (v_claim_full; admin/kb='*' = vollstaendig).
  const core = await getClaimForRole(supabase, claimId, rolle)
  if (!core) return null
  const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)
  const pflichtDokumente = await getPflichtdokumenteForFall(supabase, claimId, rolle)
  // Rollen-gescopte Exposure der admin-geladenen Sub-Entities (no-leak-Default:
  // kein Column-Profile auf auftraege/kanzlei_faelle → nur Staff sieht Rohzeilen).
  const istStaff = rolle === 'kb' || rolle === 'admin'
  return {
    rolle,
    core,
    lifecycle,
    auftraege: istStaff ? auftraege : [],
    kanzleiFall: istStaff || rolle === 'kanzlei' ? kanzleiFall : null,
    pflichtDokumente,
  }
}
