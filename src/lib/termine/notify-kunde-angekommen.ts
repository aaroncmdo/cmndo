'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'
import { resolveTerminLeadId } from '@/lib/termine/resolve-lead-id'

// KFZ-179: WhatsApp-Notification an Kunden wenn SV angekommen ist.

export async function notifyKundeAngekommen(terminId: string) {
  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, assignee_id, assignee_typ, notification_angekommen_gesendet_am')
    .eq('id', terminId)
    .single()

  if (!termin || termin.notification_angekommen_gesendet_am) return

  // Kunden-Daten — CMM-49: lead_id faelle-frei (termin.lead_id -> claims.lead_id).
  const leadId = await resolveTerminLeadId(db, termin)
  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (leadId) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', leadId).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // SV-Name — CMM-49: assignee_id (typ-guarded) statt sv_id (value-identisch fuer SV-Termine)
  const svAssigneeId = termin.assignee_typ === 'sachverstaendiger' ? termin.assignee_id : null
  const { data: sv } = svAssigneeId
    ? await db.from('sachverstaendige').select('profile_id').eq('id', svAssigneeId).single()
    : { data: null }
  let svName = 'Gutachter'
  if (sv?.profile_id) {
    const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
    if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
  }

  if (kundeTelefon) {
    await sendCommunication('sv_angekommen', {
      telefon: kundeTelefon,
      vorname: kundeVorname,
      '1': kundeVorname,
      '2': svName,
    }).catch((err: unknown) => console.error('[KFZ-179] WhatsApp angekommen failed:', err))
  }

  // Dedup-Marker NACH dem Versand — genau ihn prueft der Guard oben. Bleibt er aus,
  // schickt der naechste Aufruf dem Kunden dieselbe Nachricht erneut.
  const { error: markerFehler } = await db.from('gutachter_termine').update({
    notification_angekommen_gesendet_am: new Date().toISOString(),
  }).eq('id', terminId)
  if (markerFehler) {
    console.error(`[KFZ-179] Dedup-Marker 'angekommen' nicht gesetzt (${terminId}) — Doppel-Versand moeglich:`, markerFehler.message)
  }
}
