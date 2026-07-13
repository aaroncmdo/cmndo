// KFZ-201: Fall-aware sendCommunication helper.
// Loads contact data from a fall_id based on the registry's recipient type
// (kunde / sv / kb) and calls sendCommunication().
// Use this in business code instead of sendStatusWhatsApp().
//
// AAR-559/561: Erweitert um SV- und KB-Recipient-Resolution, damit WA-Templates
// an SV (stellungnahme_beauftragt, sv_konfrontation_anfrage) und KB korrekt
// das Telefon des tatsächlichen Empfängers verwenden, nicht das des Kunden.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { vsBetragAusEmbed } from '@/lib/faelle/claim-payment-read'
import { sendCommunication } from './send'
import { COMMUNICATION_REGISTRY } from './registry'

export async function sendFallCommunication(
  fallId: string,
  triggerName: string,
  extraData?: Record<string, string>,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const supabase = createAdminClient()
    const config = COMMUNICATION_REGISTRY[triggerName]
    if (!config) {
      console.warn(`[sendFallCommunication] Unknown trigger: ${triggerName}`)
      return { sent: false, reason: 'unbekannter Trigger' }
    }

    // CMM-49: faelle-frei — claims = SSoT. lead_id/sv_id/geschaedigter_user_id/sprache sind
    // 0-diff zu faelle; claim_nummer/kundenbetreuer_id/regulierungs_betrag claims-nativ.
    const claimId = await resolveClaimId(supabase, fallId)
    if (!claimId) return { sent: false, reason: 'kein Claim' }
    const { data: claim } = await supabase
      .from('claims')
      // Payment-Ledger Phase 3 (Collapse): VS-Betrag aus dem (claim,'vs')-Ledger (admin-Client, RLS-Bypass).
      .select('lead_id, sv_id, geschaedigter_user_id, sprache, claim_nummer, kundenbetreuer_id, claim_payments(partei, forderungsbetrag, erhaltener_betrag)')
      .eq('id', claimId)
      .maybeSingle()

    if (!claim) return { sent: false, reason: 'Claim nicht gefunden' }
    const kundenbetreuerId = claim.kundenbetreuer_id ?? null
    const fallSprache = (claim as { sprache?: string | null }).sprache ?? null

    let vorname = ''
    let nachname = ''
    let telefon: string | null = null
    let email: string | null = null
    // Track B (Doc 48): Empfaenger-Locale aus gespeicherter sprache (kein Cookie
    // im Cron). Nur fuer Kunde-Empfaenger; SV/KB sind intern -> de.
    let leadSprache: string | null = null

    if (config.recipient === 'sv' && claim.sv_id) {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', claim.sv_id)
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
      if (claim.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('vorname, nachname, telefon, email, sprache')
          .eq('id', claim.lead_id)
          .single()
        if (lead) {
          vorname = lead.vorname ?? ''
          nachname = lead.nachname ?? ''
          telefon = lead.telefon
          email = lead.email
          leadSprache = (lead as { sprache?: string | null }).sprache ?? null
        }
      }

      if (!telefon && claim.geschaedigter_user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vorname, nachname, telefon, email')
          .eq('id', claim.geschaedigter_user_id)
          .single()
        if (profile) {
          vorname = vorname || profile.vorname || ''
          nachname = nachname || profile.nachname || ''
          telefon = telefon || profile.telefon
          email = email || profile.email
        }
      }
    }

    if (!telefon && !email) return { sent: false, reason: 'kein Empfaenger (Telefon/Email)' }

    const regBetrag = vsBetragAusEmbed(claim.claim_payments)
    const betragFormatted = regBetrag != null
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(regBetrag))
      : ''

    const data: Record<string, string> = {
      fall_id: fallId,
      claim_nummer: claim.claim_nummer ?? '',
      vorname,
      nachname,
      '1': vorname || 'Empfänger',
      '2': betragFormatted,
      ...(telefon ? { telefon } : {}),
      ...(email ? { email } : {}),
      ...extraData,
    }

    // SV/KB sind interne Empfaenger (deutsch); nur der Kunde bekommt seine Sprache.
    const recipientLocale =
      config.recipient === 'sv' || config.recipient === 'kb'
        ? 'de'
        : leadSprache ?? fallSprache ?? 'de'

    // sendCommunication liefert void und WIRFT bei Fehlern (AAR-117) -> catch.
    // Kommen wir hier an, wurde ueber mind. einen Kanal (WA/Email) gesendet.
    await sendCommunication(triggerName, data, { locale: recipientLocale })
    return { sent: true }
  } catch (err) {
    console.error(`[sendFallCommunication] ${triggerName} for fall ${fallId}:`, err)
    return { sent: false, reason: err instanceof Error ? err.message : 'Ausnahme' }
  }
}
