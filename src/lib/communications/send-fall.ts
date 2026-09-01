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
import { enqueue } from '@/lib/notifications/outbox'
import { buildFallDedupKey, mapToOutboxKanal, berlinTag } from './durable-keys'

/**
 * Der DIREKTE Versand: Empfaenger aufloesen, sofort senden.
 *
 * ⚠ Der Outbox-Worker ruft GENAU DIESE Funktion — niemals die durable
 * `sendFallCommunication` darunter. Sonst wuerde der Worker beim Abarbeiten einer
 * Row eine neue Row schreiben und sich im Kreis drehen.
 *
 * Neuer Geschaeftscode nutzt `sendFallCommunication` (durable).
 */
export async function sendFallCommunicationDirekt(
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

    // ── Spur in der Fallakte (31.08.) ────────────────────────────────────────
    // Der Template-Weg hinterliess bisher KEINE Zeile in `nachrichten` — nur der direkte
    // (`sendManualWhatsApp`, Zugangsdaten) tut das. Folge: ob ein Kunde seine
    // Auftragsbestaetigung bekommen hat, war weder in der Akte noch per Query feststellbar.
    // Gemessen 31.08.: `fall_eroeffnet` = 8x `sent` in der Outbox, 0 Zeilen in `nachrichten`
    // -> eine Messung "hat der Kunde etwas bekommen?" lief zwangslaeufig ins Leere (mir genau
    // so passiert). Bei einer Bestaetigung zur Sicherungsabtretung ist das die falsche Seite
    // des Zweifels.
    //
    // Protokolliert wird der ANLASS (template_key + Zeitpunkt + Empfaenger), nicht der
    // Wortlaut: der entsteht bei WA-Templates erst in der i18n-Schicht und liegt hier nicht
    // vor. Ein erfundener Text waere schlechter als keiner.
    // Non-fatal: der Versand ist an dieser Stelle durch — ein Protokollfehler darf ihn nie
    // nachtraeglich als gescheitert erscheinen lassen.
    const kanalFuerProtokoll = config.channel.includes('whatsapp') ? 'whatsapp' : 'email'
    const { error: protokollFehler } = await supabase.from('nachrichten').insert({
      claim_id: claimId,
      kanal: kanalFuerProtokoll,
      richtung: 'outbound',
      status: 'gesendet',
      template_key: triggerName,
      nachricht: config.description,
      empfaenger_kontakt: (kanalFuerProtokoll === 'whatsapp' ? telefon : email) ?? null,
      is_system: true,
      sender_rolle: 'system',
    })
    if (protokollFehler) {
      console.error(`[sendFallCommunicationDirekt] ${triggerName}: gesendet, aber NICHT protokolliert (Claim ${claimId}):`, protokollFehler.message)
    }

    return { sent: true }
  } catch (err) {
    console.error(`[sendFallCommunicationDirekt] ${triggerName} for fall ${fallId}:`, err)
    return { sent: false, reason: err instanceof Error ? err.message : 'Ausnahme' }
  }
}

/**
 * DURABLE Fall-Kommunikation (C3/§9-#6, Aaron-Entscheid 13.08.).
 *
 * Schreibt den Anlass in die Notification-Outbox statt sofort zu senden. Damit bekommt
 * JEDER Caller ohne eigenes Zutun:
 *   • **Dedup** — derselbe Anlass (Template + Claim + Payload + Tag) = genau ein Versand,
 *     auch bei Doppel-Klick oder doppelt gefeuerter Action;
 *   • **Retry mit Backoff** statt eines still verschluckten `.catch(() => {})`;
 *   • **Sichtbarkeit im Fehlerfall** — nach erschoepften Versuchen entsteht ein
 *     Dispatch-Task (`outbox_dead_letter:<key>`) statt Stille.
 *
 * Die Latenz bleibt praktisch gleich: `enqueue` stoesst einen Immediate-Drain an; faellt
 * der aus, holt der 5-Minuten-Cron die Row.
 *
 * `sent: true` heisst hier **„Zustellung uebernommen"** (garantiert mit Retry), nicht
 * „beim Provider angekommen" — das kann synchron niemand wissen. Nur zwei Aufrufer werten
 * den Wert ueberhaupt aus (`task-executor/apply.ts`, und der Worker, der die Direkt-Variante
 * nutzt); alle anderen sind fire-and-forget.
 *
 * @param opts.dedupKey Eigener Key fuer strengere Semantik — z.B. `<template>:<claimId>`
 *   ohne Tagesscheibe, wenn ein Anlass ueber die gesamte Fall-Lebenszeit genau EINMAL
 *   senden darf. Ohne Angabe gilt der Tages-Default (siehe `buildFallDedupKey`).
 */
export async function sendFallCommunication(
  fallId: string,
  triggerName: string,
  extraData?: Record<string, string>,
  opts?: { dedupKey?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const config = COMMUNICATION_REGISTRY[triggerName]
  if (!config) {
    console.warn(`[sendFallCommunication] Unknown trigger: ${triggerName}`)
    return { sent: false, reason: 'unbekannter Trigger' }
  }

  // ⚠ Die Claim-ID MUSS vor dem enqueue aufgeloest werden: `notifications_outbox.claim_id`
  // haengt an einem FK auf `claims(id)`, waehrend Aufrufer hier auch eine `faelle.id`
  // uebergeben duerfen (`resolveClaimId` bruecken beide). Ungeloest liefe jeder Send mit
  // Fall-ID in eine FK-Verletzung und damit dauerhaft in den Direkt-Fallback unten — die
  // Outbox waere wieder wirkungslos, nur diesmal unbemerkt.
  // Nebeneffekt, der zaehlt: der Dedup-Key wird dadurch stabil, egal welche der beiden IDs
  // der Aufrufer benutzt — sonst erzeugten fall_id und claim_id zwei Keys fuer EINEN Anlass.
  const claimId = await resolveClaimId(createAdminClient(), fallId)
  if (!claimId) return { sent: false, reason: 'kein Claim' }

  const dedupKey =
    opts?.dedupKey ??
    buildFallDedupKey({
      template: triggerName,
      claimId,
      payload: extraData,
      tag: berlinTag(new Date()),
    })

  const res = await enqueue({
    dedupKey,
    kanal: mapToOutboxKanal(config.channel),
    template: triggerName,
    claimId,
    empfaengerRolle: config.recipient,
    payload: extraData,
  })

  // Die Outbox darf kein Single-Point-of-Failure fuer die gesamte Kommunikation werden:
  // ist sie nicht schreibbar (DB-Fehler), wird direkt gesendet — lieber ohne Dedup-Netz
  // als gar nicht. Ein erfolgreicher Dedup-Treffer (ok=true, enqueued=false) ist KEIN
  // Fehler, sondern der gewollte Fall „Anlass liegt bereits in der Outbox".
  if (!res.ok) {
    console.warn(`[sendFallCommunication] Outbox nicht schreibbar (${res.error}) — sende direkt:`, dedupKey)
    return sendFallCommunicationDirekt(fallId, triggerName, extraData)
  }

  return { sent: true, reason: res.enqueued ? 'enqueued' : 'bereits in der Outbox (dedup)' }
}
