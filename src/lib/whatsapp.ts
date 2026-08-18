import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { vsBetragAusEmbed } from '@/lib/faelle/claim-payment-read'
import { sendWhatsAppText } from './whatsapp/baileys-client'
import { resolveSideEffectRecipient } from '@/lib/side-effects/mode'
import { istInternesTelefon } from '@/lib/testdaten/test-sv-guard'

// ─── WhatsApp-Versand (Baileys, VPS-Worker) ──────────────────────────────────
// 2026-06-02: Twilio-WhatsApp vollstaendig entfernt — alle ausgehenden WhatsApp-
// Nachrichten laufen ueber den Baileys-Service. Twilio nur noch SMS/Voice/2FA-Verify.

/** Sendet eine WhatsApp-Text-Nachricht ueber den Baileys-VPS-Service.
 *  Behaelt die {success,sid,error}-Signatur, damit Caller unveraendert bleiben. */
export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  let cleanTo = (to ?? '').replace(/[^0-9+]/g, '')
  if (cleanTo.startsWith('00')) cleanTo = '+' + cleanTo.slice(2)
  else if (cleanTo.startsWith('0')) cleanTo = '+49' + cleanTo.slice(1)
  else if (!cleanTo.startsWith('+')) cleanTo = '+49' + cleanTo
  if (cleanTo.length < 7) return { success: false, error: 'Keine gültige Telefonnummer' }

  // Side-Effect-Gate (Prod-Smoke): dry-run unterdrueckt den Send, test-recipient leitet um.
  // Default (SIDE_EFFECT_MODE unset) = live -> unveraendert.
  const se = resolveSideEffectRecipient('whatsapp', cleanTo)
  if (se.suppress) {
    console.warn(`[side-effect:${se.mode}] WhatsApp UNTERDRUECKT -> ${cleanTo}: "${message.slice(0, 60)}"`)
    return { success: true, sid: 'side-effect-suppressed' }
  }
  if (se.mode === 'test-recipient' && se.recipient !== cleanTo) {
    console.warn(`[side-effect:test-recipient] WhatsApp UMLEITUNG ${cleanTo} -> ${se.recipient}`)
    cleanTo = se.recipient
  }

  // Send-Isolation (2026-07-03): im Live-Modus keine WhatsApp an interne/Test-Telefone
  // (Reverse-Lookup leads/profiles -> interne Email). Fail-open (nie eine echte Nachricht
  // brechen). NUR live, damit test-recipient (Umleitung an Test-Nummer) intakt bleibt.
  if (se.mode === 'live' && (await istInternesTelefon(cleanTo))) {
    console.warn(`[send-isolation] WhatsApp an internes/Test-Telefon ${cleanTo} unterdrueckt`)
    return { success: true, sid: 'internal-recipient-suppressed' }
  }

  const result = await sendWhatsAppText(cleanTo, message)
  if (result.ok) return { success: true, sid: result.messageId ?? undefined }
  console.error(`[whatsapp] Baileys send failed (${result.code}): ${result.error}`)
  return { success: false, error: result.error }
}

type NachrichtTyp =
  | 'nach_sa_unterschrift'
  | 'nach_gutachter_dispatch'
  | 'nach_terminbestaetigung'
  | 'erinnerung_24h'
  | 'erinnerung_2h'
  | 'nach_gutachten'
  | 'nach_qc_freigabe'
  | 'nach_anspruchsschreiben'
  | 'nach_regulierung'
  | 'nach_zahlung'
  | 'nach_abschluss'
  | 'eskalation_vs03'
  | 'eskalation_vs05'
  | 'eskalation_vs04'
  | 'zahlung_teilweise'
  | 'kuerzung_ruege'
  | 'kuerzung_akzeptiert'
  | 'auszahlung'
  | 'dokument_fehlt'
  | 'termin_vereinbart_kb'
  | 'termin_erinnerung_kb'
  | 'nachbesserung_gutachten'
  | 'status_update'

type FallContext = {
  claim_nummer?: string
  vorname?: string
  nachname?: string
  gutachter_name?: string
  termin_datum?: string
  termin_uhrzeit?: string
  termin_ort?: string
  betrag?: string
  kb_name?: string
  dokument_name?: string
  portal_link?: string
  termin_typ?: string
  meet_link?: string
  kuerzung_betrag?: string
  status_text?: string
}

function buildNachricht(typ: NachrichtTyp, ctx: FallContext): string {
  const name = [ctx.vorname, ctx.nachname].filter(Boolean).join(' ') || 'Kunde'
  const portal = ctx.portal_link ? `\n\nIhr Portal: ${ctx.portal_link}` : ''

  switch (typ) {
    case 'nach_sa_unterschrift':
      return `Hallo ${name}, vielen Dank! Ihre Unterlagen sind bei uns eingegangen. Wir beauftragen jetzt einen Gutachter für Ihr Fahrzeug. Sie werden in Kürze kontaktiert.${portal}\n\nIhr Claimondo-Team`

    case 'nach_gutachter_dispatch':
      return `Hallo ${name}, Ihr Gutachter ${ctx.gutachter_name ?? ''} wurde beauftragt und wird sich innerhalb von 24 Stunden bei Ihnen melden, um einen Termin zu vereinbaren.${portal}\n\nIhr Claimondo-Team`

    case 'nach_terminbestaetigung':
      return `Hallo ${name}, Ihr Gutachtertermin wurde bestätigt:\n${ctx.termin_datum ?? '—'} um ${ctx.termin_uhrzeit ?? '—'} Uhr${ctx.termin_ort ? `\nOrt: ${ctx.termin_ort}` : ''}\nGutachter: ${ctx.gutachter_name ?? '—'}${portal}\n\nIhr Claimondo-Team`

    case 'erinnerung_24h':
      return `Hallo ${name}, zur Erinnerung: Morgen kommt Ihr Gutachter ${ctx.gutachter_name ?? ''} zu Ihrem Termin${ctx.termin_uhrzeit ? ` um ${ctx.termin_uhrzeit} Uhr` : ''}. Bitte halten Sie Ihr Fahrzeug bereit.${portal}\n\nIhr Claimondo-Team`

    case 'erinnerung_2h':
      return `Hallo ${name}, in 2 Stunden ist Ihr Gutachter ${ctx.gutachter_name ?? ''} bei Ihnen. Bitte stellen Sie sicher, dass Ihr Fahrzeug zugänglich ist.${portal}\n\nIhr Claimondo-Team`

    case 'nach_gutachten':
      return `Hallo ${name}, das Gutachten für Ihr Fahrzeug wurde erstellt und wird jetzt an unsere Partnerkanzlei übergeben. Wir halten Sie auf dem Laufenden.${portal}\n\nIhr Claimondo-Team`

    case 'nach_qc_freigabe':
      return `Hallo ${name}, Ihre Akte wurde geprüft und an unsere Partnerkanzlei übergeben. Die Kanzlei wird jetzt Ihre Ansprüche gegenüber der Versicherung geltend machen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_anspruchsschreiben':
      return `Hallo ${name}, das Anspruchsschreiben wurde an die gegnerische Versicherung gesendet. Die Versicherung hat 14 Tage Zeit zu reagieren. Wir informieren Sie über jeden Fortschritt.${portal}\n\nIhr Claimondo-Team`

    case 'nach_regulierung':
      return `Hallo ${name}, gute Nachrichten! Die Versicherung hat die Regulierung Ihres Schadens angekündigt. Die Auszahlung wird in Kürze erfolgen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_zahlung':
      return `Hallo ${name}, die Zahlung${ctx.betrag ? ` in Höhe von ${ctx.betrag}` : ''} ist eingegangen! Die Abrechnung folgt in Kürze. Vielen Dank für Ihr Vertrauen.${portal}\n\nIhr Claimondo-Team`

    case 'nach_abschluss':
      return `Hallo ${name}, Ihr Fall ${ctx.claim_nummer ?? ''} wurde erfolgreich abgeschlossen! Wir freuen uns, dass wir Ihnen helfen konnten.\n\nWenn Sie zufrieden waren, würden wir uns über eine Google-Bewertung freuen: https://g.page/claimondo/review\n\nIhr Claimondo-Team`

    case 'eskalation_vs03':
      return `Hallo ${name}, wir haben die gegnerische Versicherung erneut kontaktiert, da die 14-Tage-Frist abgelaufen ist. Wir halten Sie auf dem Laufenden.${portal}\n\nIhr Claimondo-Team`

    case 'eskalation_vs05':
      return `Hallo ${name}, die Versicherung hat auf unsere Anfragen nicht reagiert. Eine Mahnung mit Verzugszinsen wurde verschickt. Wir setzen alle Hebel in Bewegung.${portal}\n\nIhr Claimondo-Team`

    case 'eskalation_vs04':
      return `Hallo ${name}, Ihr Kundenbetreuer wird Sie in Kürze anrufen, um die nächsten Schritte mit Ihnen zu besprechen.${portal}\n\nIhr Claimondo-Team`

    case 'zahlung_teilweise':
      return `Hallo ${name}, wir haben eine Teilzahlung der Versicherung erhalten. Leider wurden einige Positionen gekürzt. Ihr Kundenbetreuer ${ctx.kb_name ?? ''} wird Sie in Kürze anrufen um die nächsten Schritte zu besprechen.${portal}\n\nIhr Claimondo-Team`

    case 'kuerzung_ruege':
      return `Hallo ${name}, die Versicherung hat Ihren Anspruch um ${ctx.kuerzung_betrag ?? '—'} gekürzt. Wir akzeptieren das nicht und haben unsere Partnerkanzlei beauftragt ein Rügeschreiben zu verfassen. Sie müssen nichts weiter tun - wir kämpfen für Ihr Recht.${portal}\n\nIhr Claimondo-Team`

    case 'kuerzung_akzeptiert':
      return `Hallo ${name}, nach Prüfung der Zahlung der Versicherung wird Ihr Fall jetzt mit dem eingegangenen Betrag von ${ctx.betrag ?? '—'} abgerechnet. Die Auszahlung erfolgt in den nächsten 2-5 Werktagen.${portal}\n\nIhr Claimondo-Team`

    case 'auszahlung':
      return `Hallo ${name}, die Auszahlung in Höhe von ${ctx.betrag ?? '—'} wurde veranlasst. Der Betrag sollte innerhalb von 2-3 Werktagen auf Ihrem Konto eingehen.${portal}\n\nIhr Claimondo-Team`

    case 'dokument_fehlt':
      return `Hallo ${name}, für Ihren Fall fehlt noch: ${ctx.dokument_name ?? 'ein Dokument'}. Bitte laden Sie es in Ihrem Portal hoch oder senden Sie es hier per WhatsApp.${portal}\n\nIhr Claimondo-Team`

    case 'termin_vereinbart_kb':
      return `Hallo ${name}, Ihr Kundenbetreuer ${ctx.kb_name ?? ''} hat einen Termin mit Ihnen vereinbart: ${ctx.termin_typ === 'video-call' ? 'Video-Call' : 'Telefonat'} am ${ctx.termin_datum ?? '—'} um ${ctx.termin_uhrzeit ?? '—'}.${ctx.meet_link ? `\nLink: ${ctx.meet_link}` : ''}${portal}\n\nIhr Claimondo-Team`

    case 'termin_erinnerung_kb':
      return `Hallo ${name}, zur Erinnerung: Heute um ${ctx.termin_uhrzeit ?? '—'} haben Sie einen ${ctx.termin_typ === 'video-call' ? 'Video-Call' : 'Telefonat'} mit Ihrem Kundenbetreuer ${ctx.kb_name ?? ''}.${ctx.meet_link ? `\nLink: ${ctx.meet_link}` : ''}${portal}\n\nIhr Claimondo-Team`

    case 'nachbesserung_gutachten':
      return `Hallo ${name}, bei der Prüfung Ihres Gutachtens sind kleine Nachbesserungen nötig. Wir kümmern uns darum - Sie müssen nichts tun.${portal}\n\nIhr Claimondo-Team`

    case 'status_update':
      return `Hallo ${name}, es gibt ein Update zu Ihrem Fall: ${ctx.status_text ?? 'Status geändert'}. Bei Fragen können Sie uns jederzeit hier antworten.${portal}\n\nIhr Claimondo-Team`
  }
}

function titelFuerTyp(typ: NachrichtTyp): string {
  const map: Record<NachrichtTyp, string> = {
    nach_sa_unterschrift: 'Unterlagen eingegangen',
    nach_gutachter_dispatch: 'Gutachter beauftragt',
    nach_terminbestaetigung: 'Termin bestätigt',
    erinnerung_24h: 'Terminerinnerung (24h)',
    erinnerung_2h: 'Terminerinnerung (2h)',
    nach_gutachten: 'Gutachten erstellt',
    nach_qc_freigabe: 'Akte an Kanzlei übergeben',
    nach_anspruchsschreiben: 'Anspruchsschreiben gesendet',
    nach_regulierung: 'Regulierung angekündigt',
    nach_zahlung: 'Zahlung eingegangen',
    nach_abschluss: 'Fall abgeschlossen',
    eskalation_vs03: 'Eskalation: Frist abgelaufen',
    eskalation_vs05: 'Eskalation: Mahnung + Verzugszinsen',
    eskalation_vs04: 'Eskalation: Kundenrückruf',
    zahlung_teilweise: 'Teilzahlung eingegangen',
    kuerzung_ruege: 'Kürzung - Rügeschreiben',
    kuerzung_akzeptiert: 'Kürzung akzeptiert',
    auszahlung: 'Auszahlung veranlasst',
    dokument_fehlt: 'Dokument fehlt',
    termin_vereinbart_kb: 'Termin vereinbart',
    termin_erinnerung_kb: 'Termin-Erinnerung',
    nachbesserung_gutachten: 'Nachbesserung nötig',
    status_update: 'Status-Update',
  }
  return map[typ]
}

/**
 * Send a manual WhatsApp message via Twilio (replaces wa.me links).
 */
export async function sendManualWhatsApp(telefon: string, message: string, fallId?: string): Promise<{ success: boolean; error?: string }> {
  if (!telefon) return { success: false, error: 'Keine Telefonnummer' }
  const result = await sendWhatsApp(telefon, message)
  console.log(`[whatsapp:manual] ${telefon} → success=${result.success}${result.error ? ` error=${result.error}` : ''}`)

  // Store in nachrichten if fall context
  if (fallId) {
    try {
      const supabase = createAdminClient()
      await supabase.from('nachrichten').insert({
        fall_id: fallId,
        kanal: 'whatsapp',
        sender_id: null,
        sender_rolle: 'admin',
        nachricht: message,
        hat_anhang: false,
      })
      await supabase.from('timeline').insert({
        fall_id: fallId,
        typ: 'whatsapp',
        titel: 'WhatsApp manuell gesendet',
        beschreibung: `An ${telefon}: ${message.slice(0, 100)}...`,
      })
    } catch { /* non-critical */ }
  }

  return result
}

/**
 * Sends a WhatsApp status notification to the customer.
 * For now: stores the message in the nachrichten table (kanal='whatsapp').
 * WhatsApp Business API will be connected later.
 */

export async function sendStatusWhatsApp(
  fallId: string,
  nachrichtTyp: NachrichtTyp,
  extraCtx?: Partial<FallContext>,
) {
  try {
    const supabase = createAdminClient()

    // Load fall data
    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT).
    // CMM-44 SP-B PR2a: claim_id mitlesen für google_review_gesendet-Write auf claims.
    // CMM-49: claims-direkt (SSoT) via resolveClaimId — sv_id/lead_id 0-diff, kunde_id ->
    // geschaedigter_user_id (0-diff); claim_nummer/regulierungs_betrag claims-nativ.
    const waClaimId = await resolveClaimId(supabase, fallId)
    const { data: fallClaim } = waClaimId
      ? await supabase
          .from('claims')
          .select('geschaedigter_user_id, lead_id, sv_id, claim_nummer, claim_payments(partei, forderungsbetrag, erhaltener_betrag)')
          .eq('id', waClaimId)
          .maybeSingle()
      : { data: null }

    if (!fallClaim) return

    // Get customer name + phone from lead or profile
    let vorname = ''
    let nachname = ''
    let telefon: string | null = null

    if (fallClaim.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('vorname, nachname, telefon')
        .eq('id', fallClaim.lead_id)
        .single()
      if (lead) {
        vorname = lead.vorname ?? ''
        nachname = lead.nachname ?? ''
        telefon = lead.telefon
      }
    }

    // Fallback: try profile via kunde_id
    if (!telefon && fallClaim.geschaedigter_user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vorname, nachname, telefon')
        .eq('id', fallClaim.geschaedigter_user_id)
        .single()
      if (profile) {
        vorname = vorname || profile.vorname || ''
        nachname = nachname || profile.nachname || ''
        telefon = profile.telefon
      }
    }

    // Get gutachter name if needed
    let gutachterName: string | undefined
    if (fallClaim.sv_id) {
      const { data: sv } = await supabase
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', fallClaim.sv_id)
        .single()
      if (sv?.profile_id) {
        const { data: svProfile } = await supabase
          .from('profiles')
          .select('vorname, nachname')
          .eq('id', sv.profile_id)
          .single()
        if (svProfile) {
          gutachterName = [svProfile.vorname, svProfile.nachname].filter(Boolean).join(' ')
        }
      }
    }

    // Build portal link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
    const portalLink = `${appUrl}/kunde`

    // Build context
    // Payment-Ledger Phase 3 (Collapse): VS-Betrag aus dem (claim,'vs')-Ledger statt Cache.
    const waRegBetrag = vsBetragAusEmbed(fallClaim?.claim_payments)
    const ctx: FallContext = {
      claim_nummer: fallClaim?.claim_nummer ?? undefined,
      vorname,
      nachname,
      gutachter_name: gutachterName,
      portal_link: portalLink,
      betrag: waRegBetrag != null
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(waRegBetrag))
        : undefined,
      ...extraCtx,
    }

    const nachricht = buildNachricht(nachrichtTyp, ctx)
    const titel = titelFuerTyp(nachrichtTyp)

    // Store in nachrichten table
    await supabase.from('nachrichten').insert({
      fall_id: fallId,
      kanal: 'whatsapp',
      sender_id: null,
      sender_rolle: 'system',
      nachricht,
      hat_anhang: false,
    })

    // Timeline entry
    await supabase.from('timeline').insert({
      fall_id: fallId,
      typ: 'whatsapp',
      titel: `WhatsApp: ${titel}`,
      beschreibung: telefon
        ? `Nachricht an ${telefon} gesendet.`
        : 'Keine Telefonnummer hinterlegt – Nachricht nur protokolliert.',
    })

    if (telefon) {
      const sendResult = await sendWhatsApp(telefon, nachricht)
      if (!sendResult.success) {
        supabase.from('timeline').insert({
          fall_id: fallId, typ: 'system',
          titel: 'WhatsApp-Versand fehlgeschlagen',
          beschreibung: `Nachricht an ${telefon} konnte nicht gesendet werden: ${sendResult.error ?? 'unbekannt'}`,
        }).then(() => {})
      }
    }

    // CMM-44 SP-B PR2a: google_review_gesendet lebt jetzt auf claims (SSoT).
    if (nachrichtTyp === 'nach_abschluss') {
      const claimId = waClaimId
      if (claimId) {
        // Dedup-Marker NACH dem Versand: ohne ihn bekommt der Kunde die
        // Bewertungs-Anfrage erneut.
        const { error: reviewMarkerFehler } = await supabase
          .from('claims')
          .update({ google_review_gesendet: true })
          .eq('id', claimId)
        if (reviewMarkerFehler) {
          console.error(`[whatsapp] google_review_gesendet nicht gesetzt (Claim ${claimId}) — Doppel-Versand moeglich:`, reviewMarkerFehler.message)
        }
      }
    }
  } catch (err) {
    console.error(`[whatsapp] Failed to send ${nachrichtTyp} for fall ${fallId}:`, err)
  }
}
