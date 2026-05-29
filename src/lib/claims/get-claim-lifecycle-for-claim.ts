// CMM-44 Claim-Phasen-SSoT (P0): zentraler Server-Loader fuer den Claim-Lifecycle.
//
// EINE Quelle fuer die Claim-Phase ueber alle Server-Detail-Konsumenten
// (Kunde-Page, kuenftig SV/Admin/KB/Kanzlei) — damit die Lifecycle-Input-Assembly
// nicht an N Stellen dupliziert wird (das ist die Drift-Quelle, die der
// claims-as-ssot-Phasenschnitt schliesst). Die eigentliche Aggregation lebt in
// getClaimLifecycle (src/lib/claims/lifecycle.ts, CMM-32); dieser Loader liefert
// nur die drei Sub-Entity-Inputs (Lead / Auftraege / Kanzleifall) dazu.
//
// Datenmodell-Hinweise (CMM-44 MP-8b korrigiert):
//   - claims.id != faelle.id! Echter Link: faelle.claim_id -> claims.id. Status + Lead
//     kommen ueber den CLAIM (bit-gleich zur claims-zentrischen v_claim_phase).
//   - auftraege/kanzlei_faelle bleiben per fall_id gekeyt (== claim_id-Menge fuer Faelle;
//     der Loader bedient nur Fall-Detail-Routen).
//   - sa_unterschrieben / vollmacht_signiert_am leben auf leads (via claims.lead_id).
//   - onboarding_complete wird von getClaimLifecycle NICHT genutzt -> nicht geladen.
//
// Liefert ein Bundle (lifecycle + auftraege + kanzleiFall), damit Detail-Pages,
// die die Sub-Entities ohnehin weiterverwenden, keinen Doppel-Load brauchen.
// Listen/Kanban/RLS nutzen NICHT diesen Per-Claim-Loader (N+1), sondern die
// SQL-Spiegel-View v_claim_phase (P0 Migration).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAlleAuftraege, type AuftragRow } from '@/lib/auftrag/queries'
import { getKanzleiFall, type KanzleiFallRow } from '@/lib/kanzlei-fall/queries'
import {
  getClaimLifecycle,
  type ClaimLifecycle,
  type ClaimLifecycleInput,
} from '@/lib/claims/lifecycle'

export type ClaimLifecycleBundle = {
  lifecycle: ClaimLifecycle
  auftraege: AuftragRow[]
  kanzleiFall: KanzleiFallRow | null
}

export async function getClaimLifecycleForClaim(
  admin: SupabaseClient,
  fallId: string,
): Promise<ClaimLifecycleBundle> {
  // CMM-44 MP-8b: claims.id != faelle.id -> ueber faelle.claim_id den Claim aufloesen.
  // Status + lead_id kommen aus dem CLAIM (bit-gleich zur claims-zentrischen v_claim_phase).
  const { data: fall } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fall?.claim_id as string | null) ?? null

  let lead: ClaimLifecycleInput['lead'] = null
  let claimStatus: string | null = null
  if (claimId) {
    const { data: claim } = await admin
      .from('claims')
      .select('status, lead_id')
      .eq('id', claimId)
      .maybeSingle()
    claimStatus = (claim?.status as string | null) ?? null
    if (claim?.lead_id) {
      const { data: leadRow } = await admin
        .from('leads')
        .select('sa_unterschrieben, vollmacht_signiert_am')
        .eq('id', claim.lead_id as string)
        .maybeSingle()
      if (leadRow) {
        lead = {
          sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
          vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
          onboarding_complete: null, // von getClaimLifecycle nicht genutzt
        }
      }
    }
  }

  const [auftraege, kanzleiFall] = await Promise.all([
    getAlleAuftraege(admin, fallId),
    getKanzleiFall(admin, fallId),
  ])

  return {
    lifecycle: getClaimLifecycle({ lead, auftraege, kanzleiFall, claimStatus }),
    auftraege,
    kanzleiFall,
  }
}
