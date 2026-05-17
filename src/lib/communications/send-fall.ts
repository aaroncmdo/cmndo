// KFZ-201: Fall-aware sendCommunication helper.
// Loads contact data from a fall_id based on the registry's recipient type
// (kunde / sv / kb) and calls sendCommunication().
// Use this in business code instead of sendStatusWhatsApp().
//
// AAR-559/561: Erweitert um SV- und KB-Recipient-Resolution, damit WA-Templates
// an SV (stellungnahme_beauftragt, sv_konfrontation_anfrage) und KB korrekt
// das Telefon des tatsächlichen Empfängers verwenden, nicht das des Kunden.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from './send'
import { COMMUNICATION_REGISTRY } from './registry'

export async function sendFallCommunication(
  fallId: string,
  triggerName: string,
  extraData?: Record<string, string>,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const config = COMMUNICATION_REGISTRY[triggerName]
    if (!config) {
      console.warn(`[sendFallCommunication] Unknown trigger: ${triggerName}`)
      return
    }

    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT).
    const { data: fall } = await supabase
      .from('faelle')
      .select('id, lead_id, sv_id, kunde_id, claims:claim_id(claim_nummer, kundenbetreuer_id, regulierungs_betrag)')
      .eq('id', fallId)
      .single()

    if (!fall) return
    const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    const kundenbetreuerId = fallClaim?.kundenbetreuer_id ?? null

    let vorname = ''
    let nachname = ''
    let telefon: string | null = null
    let email: string | null = null

    if (config.recipient === 'sv' && fall.sv_id) {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', fall.sv_id)
        .single()
      if (sv?.profile_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vorname, nachname, telefon, email')
          .eq('id', sv.profile_id)
          .single()
        if (profile) {
          vorname = profile.vorname ?? ''
          nachname = profile.nachname ?? ''
          telefon = profile.telefon
          email = profile.email
        }
      }
    } else if (config.recipient === 'kb' && kundenbetreuerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vorname, nachname, telefon, email')
        .eq('id', kundenbetreuerId)
        .single()
      if (profile) {
        vorname = profile.vorname ?? ''
        nachname = profile.nachname ?? ''
        telefon = profile.telefon
        email = profile.email
      }
    } else {
      // Default: Kunde (recipient === 'kunde' or anything else falls back to Kunde)
      if (fall.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('vorname, nachname, telefon, email')
          .eq('id', fall.lead_id)
          .single()
        if (lead) {
          vorname = lead.vorname ?? ''
          nachname = lead.nachname ?? ''
          telefon = lead.telefon
          email = lead.email
        }
      }

      if (!telefon && fall.kunde_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vorname, nachname, telefon, email')
          .eq('id', fall.kunde_id)
          .single()
        if (profile) {
          vorname = vorname || profile.vorname || ''
          nachname = nachname || profile.nachname || ''
          telefon = telefon || profile.telefon
          email = email || profile.email
        }
      }
    }

    if (!telefon && !email) return

    const betragFormatted = fallClaim?.regulierungs_betrag
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
          Number(fallClaim.regulierungs_betrag),
        )
      : ''

    const data: Record<string, string> = {
      fall_id: fallId,
      claim_nummer: fallClaim?.claim_nummer ?? '',
      vorname,
      nachname,
      '1': vorname || 'Empfänger',
      '2': betragFormatted,
      ...(telefon ? { telefon } : {}),
      ...(email ? { email } : {}),
      ...extraData,
    }

    await sendCommunication(triggerName, data)
  } catch (err) {
    console.error(`[sendFallCommunication] ${triggerName} for fall ${fallId}:`, err)
  }
}
