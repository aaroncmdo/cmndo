// CMM-44 MP-4e: Shared Loader — lädt v_claim_phase (main_phase/sub_phase) für eine
// Liste von claim_ids und gibt eine getypte Map zurück.
// CMM-44 MP-8b: v_claim_phase ist claims-zentrisch — der Key ist `claims.id` (NICHT
// mehr faelle.id; die Annahme claim_id==faelle.id war gebrochen). Caller MÜSSEN claims.id
// übergeben (Fallakte/kanzlei nutzen fall.claim_id; makler mappt faelle.claim_id).
//
// WARUM Service-Client: v_claim_phase ist `security_invoker` und leitet die Phase
// live aus faelle/claims/kanzlei_faelle/leads/auftraege ab. Rollen mit
// eingeschränkter RLS (Makler/Kanzlei) sehen NICHT alle Join-Tabellen (z.B.
// auftraege/leads) → die View würde für sie falsche Phasen liefern. Daher lesen
// wir die View per Service-Client für die IDs, die der Caller bereits anderweitig
// RLS-gefiltert hat (z.B. über makler_fall_consent / service_typ='komplett') — kein
// Leak, weil nur ohnehin sichtbare Fälle abgefragt werden.
//
// Listen/Kanban nutzen das (kein N+1); Detail-Konsumenten mit vollem
// getClaimLifecycle-Loader brauchen es nicht.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  toClaimMainPhase,
  toClaimSubPhase,
  type ClaimMainPhase,
  type ClaimSubPhase,
} from './lifecycle'

export type ClaimPhaseCell = { mainPhase: ClaimMainPhase; subPhase: ClaimSubPhase }

export async function getClaimPhaseMap(
  claimIds: string[],
): Promise<Map<string, ClaimPhaseCell>> {
  const map = new Map<string, ClaimPhaseCell>()
  if (claimIds.length === 0) return map
  const admin = createAdminClient()
  const { data } = await admin
    .from('v_claim_phase')
    .select('claim_id, main_phase, sub_phase')
    .in('claim_id', claimIds)
  for (const row of (data ?? []) as Array<{
    claim_id: string
    main_phase: string | null
    sub_phase: string | null
  }>) {
    map.set(row.claim_id, {
      mainPhase: toClaimMainPhase(row.main_phase),
      subPhase: toClaimSubPhase(row.sub_phase),
    })
  }
  return map
}
