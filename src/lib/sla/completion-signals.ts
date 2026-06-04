// AAR-431: Completion-Signal-Checker. Da wir keinen Webhook haben, muss der
// Cron pro aktivem Kanzlei-SLA prüfen ob das entsprechende DB-Feld inzwischen
// gesetzt wurde. Wenn ja → SLA auf completed setzen.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { KanzleiSlaTyp } from './blocker-detection'

export interface SlaRecordMinimal {
  id: string
  fall_id: string
  sla_typ: KanzleiSlaTyp
}

/**
 * Prüft ob der Kanzlei-SLA durch einen DB-Zustand als erledigt gelten darf.
 * kanzlei_as_versand     → faelle.anschlussschreiben_am IS NOT NULL
 * kanzlei_ruege_versand  → faelle.ruege_gesendet_am IS NOT NULL
 * kanzlei_kuerzung_antwort → faelle.ruege_gesendet_am IS NOT NULL (Kanzlei
 *                          hat Rüge verfasst = Reaktion auf Kürzung) ODER
 *                          forderungspositionen.betrag_gekuerzt=0 (Kürzung
 *                          akzeptiert / neu reguliert)
 * kanzlei_vs_nachfass    → manuell (KB-Task erledigt) — hier immer false
 */
export async function checkCompletionSignal(sla: SlaRecordMinimal): Promise<boolean> {
  const db = createAdminClient()
  // CMM-49: faelle-frei — claims = SSoT. kanzlei_faelle (1:1 per Claim) + operative_status
  // via claims-Embed; claimId aus sla.fall_id (resolveClaimId, Bridge-safe). Der frühere
  // faelle.status-Fallback entfällt — operative_status ist die gebackfillte SSoT (0-diff).
  const claimId = await resolveClaimId(db, sla.fall_id)
  if (!claimId) return false

  if (sla.sla_typ === 'kanzlei_as_versand') {
    // CMM-44 SP-I2 PR2: anschlussschreiben_am lebt auf kanzlei_faelle (1:1 per Claim).
    const { data: claim } = await db
      .from('claims')
      .select('kanzlei_faelle(anschlussschreiben_am)')
      .eq('id', claimId)
      .maybeSingle()
    const kf = Array.isArray((claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle)
      ? ((claim as { kanzlei_faelle: unknown[] }).kanzlei_faelle)[0]
      : (claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle
    return Boolean((kf as { anschlussschreiben_am?: string | null } | null)?.anschlussschreiben_am)
  }

  if (sla.sla_typ === 'kanzlei_ruege_versand') {
    // CMM-44 SP-I5: ruege_gesendet_am lebt auf kanzlei_faelle (1:1) — via Embed.
    const { data: claim } = await db
      .from('claims')
      .select('kanzlei_faelle(ruege_gesendet_am)')
      .eq('id', claimId)
      .maybeSingle()
    const kf = Array.isArray((claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle)
      ? ((claim as { kanzlei_faelle: unknown[] }).kanzlei_faelle)[0]
      : (claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle
    return Boolean((kf as { ruege_gesendet_am?: string | null } | null)?.ruege_gesendet_am)
  }

  if (sla.sla_typ === 'kanzlei_kuerzung_antwort') {
    // CMM-44 SP-I5: ruege_gesendet_am aus kanzlei_faelle (1:1).
    // CMM-74: Status = claims.operative_status (SSoT).
    const { data: claim } = await db
      .from('claims')
      .select('operative_status, kanzlei_faelle(ruege_gesendet_am)')
      .eq('id', claimId)
      .maybeSingle()
    const kf = Array.isArray((claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle)
      ? ((claim as { kanzlei_faelle: unknown[] }).kanzlei_faelle)[0]
      : (claim as { kanzlei_faelle?: unknown } | null)?.kanzlei_faelle
    if ((kf as { ruege_gesendet_am?: string | null } | null)?.ruege_gesendet_am) return true
    const fallStatus = ((claim as { operative_status?: string | null } | null)?.operative_status as string | null) ?? null
    // Status hat sich von vs-kuerzt weg bewegt (Kanzlei hat reagiert)
    if (fallStatus && !['vs-kuerzt', 'anschlussschreiben'].includes(fallStatus)) {
      return true
    }
    return false
  }

  // kanzlei_vs_nachfass → wird manuell per KB abgeschlossen (Task-Close)
  return false
}
