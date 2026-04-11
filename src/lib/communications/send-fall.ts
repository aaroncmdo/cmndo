// KFZ-201: Fall-aware sendCommunication helper.
// Loads telefon + Kundenname from a fall_id and calls sendCommunication().
// Use this in business code instead of sendStatusWhatsApp().

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from './send'

/**
 * Resolves customer contact data from a fall_id, then calls sendCommunication.
 *
 * @param fallId    UUID of the fall
 * @param triggerName  Registry trigger name (e.g. 'fall_eroeffnet')
 * @param extraData  Any extra template variables to pass (merged with resolved data)
 */
export async function sendFallCommunication(
  fallId: string,
  triggerName: string,
  extraData?: Record<string, string>,
): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { data: fall } = await supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id, sv_id, kunde_id, regulierung_betrag')
      .eq('id', fallId)
      .single()

    if (!fall) return

    let vorname = ''
    let nachname = ''
    let telefon: string | null = null

    if (fall.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('vorname, nachname, telefon')
        .eq('id', fall.lead_id)
        .single()
      if (lead) {
        vorname = lead.vorname ?? ''
        nachname = lead.nachname ?? ''
        telefon = lead.telefon
      }
    }

    if (!telefon && fall.kunde_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vorname, nachname, telefon')
        .eq('id', fall.kunde_id)
        .single()
      if (profile) {
        vorname = vorname || profile.vorname || ''
        nachname = nachname || profile.nachname || ''
        telefon = profile.telefon
      }
    }

    if (!telefon) return

    const betragFormatted = fall.regulierung_betrag
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
          Number(fall.regulierung_betrag),
        )
      : ''

    const data: Record<string, string> = {
      telefon,
      fall_id: fallId,
      fall_nummer: fall.fall_nummer ?? '',
      vorname,
      nachname,
      '1': vorname || 'Kunde',
      '2': betragFormatted,
      ...extraData,
    }

    await sendCommunication(triggerName, data)
  } catch (err) {
    console.error(`[sendFallCommunication] ${triggerName} for fall ${fallId}:`, err)
  }
}
