'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send-template'

// KFZ-179: WhatsApp-Notification an Kunden wenn SV angekommen ist.

export async function notifyKundeAngekommen(terminId: string) {
  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, notification_angekommen_gesendet_am')
    .eq('id', terminId)
    .single()

  if (!termin || termin.notification_angekommen_gesendet_am) return

  // Kunden-Daten
  const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // SV-Name
  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
  let svName = 'Gutachter'
  if (sv?.profile_id) {
    const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
    if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ')
  }

  if (kundeTelefon) {
    await sendWhatsAppTemplate(kundeTelefon, 'sv_angekommen', {
      '1': kundeVorname,
      '2': svName,
    }).catch(err => console.error('[KFZ-179] WhatsApp angekommen failed:', err))
  }

  await db.from('gutachter_termine').update({
    notification_angekommen_gesendet_am: new Date().toISOString(),
  }).eq('id', terminId)
}
