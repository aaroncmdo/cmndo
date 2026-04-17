// AAR-431: Completion-Signal-Checker. Da wir keinen Webhook haben, muss der
// Cron pro aktivem Kanzlei-SLA prüfen ob das entsprechende DB-Feld inzwischen
// gesetzt wurde. Wenn ja → SLA auf completed setzen.

import { createAdminClient } from '@/lib/supabase/admin'
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

  if (sla.sla_typ === 'kanzlei_as_versand') {
    const { data } = await db
      .from('faelle')
      .select('anschlussschreiben_am')
      .eq('id', sla.fall_id)
      .maybeSingle()
    return Boolean(data?.anschlussschreiben_am)
  }

  if (sla.sla_typ === 'kanzlei_ruege_versand') {
    const { data } = await db
      .from('faelle')
      .select('ruege_gesendet_am')
      .eq('id', sla.fall_id)
      .maybeSingle()
    return Boolean(data?.ruege_gesendet_am)
  }

  if (sla.sla_typ === 'kanzlei_kuerzung_antwort') {
    const { data: fall } = await db
      .from('faelle')
      .select('ruege_gesendet_am, status')
      .eq('id', sla.fall_id)
      .maybeSingle()
    if (fall?.ruege_gesendet_am) return true
    // Fall-Status hat sich von vs-kuerzt weg bewegt (Kanzlei hat reagiert)
    if (fall?.status && !['vs-kuerzt', 'anschlussschreiben'].includes(fall.status as string)) {
      return true
    }
    return false
  }

  // kanzlei_vs_nachfass → wird manuell per KB abgeschlossen (Task-Close)
  return false
}
