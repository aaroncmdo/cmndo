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
//   - sa_unterschrieben / vollmacht_signiert_am: FG6 liest die CLAIM-Copy (canonical
//     post-conversion) via readClaimSigningState; leads nur pre-conversion-Fallback.
//   - onboarding_complete wird von getClaimLifecycle NICHT genutzt -> nicht geladen.
//
// Liefert ein Bundle (lifecycle + auftraege + kanzleiFall), damit Detail-Pages,
// die die Sub-Entities ohnehin weiterverwenden, keinen Doppel-Load brauchen.
// Listen/Kanban/RLS nutzen NICHT diesen Per-Claim-Loader (N+1), sondern die
// SQL-Spiegel-View v_claim_phase (P0 Migration).

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClaimId } from './get-claim-for-role'
import { readClaimSigningState } from './signing-state'
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
  // CMM-44 MP-8b / CMM-49: fall_id -> claim_id via resolveClaimId (bridge, faelle-frei).
  // Status + lead_id kommen aus dem CLAIM (bit-gleich zur claims-zentrischen v_claim_phase).
  const claimId = await resolveClaimId(admin, fallId)

  let lead: ClaimLifecycleInput['lead'] = null
  // AAR-939: service_typ -> ClaimLifecycle.serviceTyp, damit Stepper/Pipeline die
  // Regulierungs-Phase fuer nur_gutachter ausblenden (kein Regulierungs-Tail).
  let serviceTyp: string | null = null
  // Unified Stepper: operative_status ist die kanonische Phasen-Quelle fuer getClaimLifecycle.
  let operativeStatus: string | null = null
  // WS6/Kasko-Fix: Direct-Reparatur-Signale (kasko/selbstzahler -> Reparatur-Lane statt SA-Kaskade).
  let abrechnungsweg: string | null = null
  let reparaturWerkstattId: string | null = null
  let reparaturTerminStatus: string | null = null
  if (claimId) {
    const { data: claim } = await admin
      .from('claims')
      // T3-slice-2a: claims.status raus — getClaimLifecycle liest seit slice-2a-ii nur operative_status.
      .select('lead_id, service_typ, operative_status, sa_unterschrieben, sa_unterschrieben_am, vollmacht_signiert_am, abrechnungsweg, reparatur_werkstatt_id')
      .eq('id', claimId)
      .maybeSingle()
    serviceTyp = (claim?.service_typ as string | null) ?? null
    operativeStatus = (claim?.operative_status as string | null) ?? null
    abrechnungsweg = (claim?.abrechnungsweg as string | null) ?? null
    reparaturWerkstattId = (claim?.reparatur_werkstatt_id as string | null) ?? null
    // Nur fuer Direct-Reparatur-Wege relevant -> Query nur dann (juengster Termin, wie
    // v_claim_phase rt: updated_at DESC NULLS LAST, created_at DESC).
    if (abrechnungsweg === 'kasko' || abrechnungsweg === 'selbstzahler') {
      const { data: rt } = await admin
        .from('reparatur_termine')
        .select('status')
        .eq('claim_id', claimId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      reparaturTerminStatus = (rt?.status as string | null) ?? null
    }
    // FG6 (dual-SSoT collapse): SA/Vollmacht liegen auf claims UND leads. Kanonisch ist
    // die CLAIM-Copy post-conversion (readClaimSigningState); leads nur als
    // pre-conversion-Fallback. Fixt die Divergenz getClaimLifecycle(las lead-copy) vs
    // resolveSubphase(claim-copy) -> beide lesen jetzt dieselbe (claim-)Wahrheit.
    let leadSigning: { sa_unterschrieben: boolean | null; vollmacht_signiert_am: string | null } | null = null
    if (claim?.lead_id) {
      const { data: leadRow } = await admin
        .from('leads')
        .select('sa_unterschrieben, vollmacht_signiert_am')
        .eq('id', claim.lead_id as string)
        .maybeSingle()
      if (leadRow) {
        leadSigning = {
          sa_unterschrieben: (leadRow.sa_unterschrieben as boolean | null) ?? null,
          vollmacht_signiert_am: (leadRow.vollmacht_signiert_am as string | null) ?? null,
        }
      }
    }
    const signing = readClaimSigningState({
      hasClaim: true,
      claim: {
        sa_unterschrieben: (claim?.sa_unterschrieben as boolean | null) ?? null,
        sa_unterschrieben_am: (claim?.sa_unterschrieben_am as string | null) ?? null,
        vollmacht_signiert_am: (claim?.vollmacht_signiert_am as string | null) ?? null,
      },
      lead: leadSigning,
    })
    lead = {
      sa_unterschrieben: signing.saUnterschrieben,
      vollmacht_signiert_am: signing.vollmachtSigniertAm,
      onboarding_complete: null, // von getClaimLifecycle nicht genutzt
    }
  }

  const [auftraege, kanzleiFall] = await Promise.all([
    getAlleAuftraege(admin, fallId),
    getKanzleiFall(admin, fallId),
  ])

  return {
    // AAR-939: serviceTyp anhaengen (getClaimLifecycle bleibt rein -> Parity zu
    // v_claim_phase unberuehrt; nur ein Render-Sicht-Filter fuer die Phasen).
    lifecycle: { ...getClaimLifecycle({ lead, auftraege, kanzleiFall, operativeStatus, abrechnungsweg, reparaturWerkstattId, reparaturTerminStatus }), serviceTyp },
    auftraege,
    kanzleiFall,
  }
}
