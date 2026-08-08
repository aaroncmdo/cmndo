// Value-Loop: Makler pro Provisions-Statuswechsel benachrichtigen (N5 handhabt Kanaele in_app/web_push/
// email + Opt-Outs + Audit). Werkstatt und firmen_flotte bekommen KEIN Event — die sehen ihre
// Provisionen im jeweiligen Portal (so war es schon vor der Runner-Vereinheitlichung, bewusst).
//
// Wird als onStatusChange-Hook in runProvisionsRelease gereicht; der Runner faengt throws ab
// (best-effort — eine fehlgeschlagene Notification darf den Status-Flip nie zurueckrollen).

import { emitEvent } from '@/lib/notifications/emit'
import type { ReleasePendingRow, ReleaseStatus } from './release-runner'

export async function notifyMaklerProvisionStatus(
  row: ReleasePendingRow,
  status: ReleaseStatus,
  grund?: string,
): Promise<boolean> {
  // makler + makler_empfehlung (Sponsor-Override): beide partner_id = ein makler.id -> derselbe
  // Notification-Pfad. Werkstatt/firmen_flotte bleiben bewusst ohne Event (Portal-Sicht).
  if (row.partner_typ !== 'makler' && row.partner_typ !== 'makler_empfehlung') return false

  await emitEvent('makler.provision_status', {
    fallId: row.fall_id ?? row.claim_id ?? '',
    provisionId: row.id,
    maklerId: row.partner_id,
    status,
    betragEur: Number(row.betrag_netto_eur),
    grund,
  })
  return true
}
