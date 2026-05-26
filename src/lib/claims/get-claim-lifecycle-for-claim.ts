// CMM-44 Claim-Phasen-SSoT (P0): zentraler Server-Loader fuer den Claim-Lifecycle.
//
// EINE Quelle fuer die Claim-Phase ueber alle Server-Detail-Konsumenten
// (Kunde-Page, kuenftig SV/Admin/KB/Kanzlei) — damit die Lifecycle-Input-Assembly
// nicht an N Stellen dupliziert wird (das ist die Drift-Quelle, die der
// claims-as-ssot-Phasenschnitt schliesst). Die eigentliche Aggregation lebt in
// getClaimLifecycle (src/lib/claims/lifecycle.ts, CMM-32); dieser Loader liefert
// nur die drei Sub-Entity-Inputs (Lead / Auftraege / Kanzleifall) dazu.
//
// Datenmodell-Hinweise:
//   - fallId == claims.id (1:1). auftraege/kanzlei_faelle sind per fall_id gekeyt.
//   - onboarding_complete lebt auf faelle (NICHT leads) — sonst 400.
//   - sa_unterschrieben / vollmacht_signiert_am leben auf leads.
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
  const { data: fall } = await admin
    .from('faelle')
    .select('lead_id, onboarding_complete')
    .eq('id', fallId)
    .maybeSingle()

  let lead: ClaimLifecycleInput['lead'] = null
  if (fall?.lead_id) {
    const { data: leadRow } = await admin
      .from('leads')
      .select('sa_unterschrieben, vollmacht_signiert_am')
      .eq('id', fall.lead_id as string)
      .maybeSingle()
    if (leadRow) {
      lead = {
        sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
        vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
        onboarding_complete: (fall.onboarding_complete as boolean | null) ?? null,
      }
    }
  }

  const [auftraege, kanzleiFall] = await Promise.all([
    getAlleAuftraege(admin, fallId),
    getKanzleiFall(admin, fallId),
  ])

  return {
    lifecycle: getClaimLifecycle({ lead, auftraege, kanzleiFall }),
    auftraege,
    kanzleiFall,
  }
}
