// AAR-939 (Baileys Task B): Text-Intent-Prozessor — provider-neutral.
// Portiert die JA/NEIN/Umtermin-Logik aus dem Twilio-Inbound-Webhook in ein
// wiederverwendbares Lib-Modul, das von beliebigen Inbound-Routen gerufen wird.
//
// KEIN 'use server' — wird von API-Routen (nicht Client) genutzt und muss
// Konstanten korrekt exportieren koennen.

import type { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import type { MatchResult } from '@/lib/inbound/match-fall'
import { closeNurGutachterTerminAlsDurchgefuehrt } from '@/lib/termine/close-nur-gutachter-termin'
import { istClaimGeschlossen } from '@/lib/claims/terminal-status'
import {
  createEmbedBKlaerungTask,
  TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE,
} from '@/lib/termine/embed-b-klaerung-task'
import { sendCommunication } from '@/lib/communications/send'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboundIntent =
  | 'termin_bestaetigung_ja'
  | 'termin_bestaetigung_nein'
  | 'umtermin'
  | 'unknown'

// ─── detectIntent ─────────────────────────────────────────────────────────────

/**
 * Klassifiziert den Text einer eingehenden WhatsApp-Nachricht als Intent.
 * Identische Keyword-Liste wie der Twilio-Webhook.
 */
export function detectIntent(body: string): InboundIntent {
  const upper = body.toUpperCase().trim()
  if (['JA', 'OK', 'BESTAETIGT', 'BESTÄTIGT', 'JAA'].includes(upper)) {
    return 'termin_bestaetigung_ja'
  }
  if (['NEIN', 'NEIN DANKE', 'NEINN'].includes(upper)) {
    return 'termin_bestaetigung_nein'
  }
  if (
    upper.includes('VERSCHIEBEN') ||
    upper.includes('UMTERMIN') ||
    upper.includes('ANDEREN TERMIN')
  ) {
    return 'umtermin'
  }
  return 'unknown'
}

// ─── processInboundText ───────────────────────────────────────────────────────

/**
 * Verarbeitet einen eingehenden Text-Intent (JA/NEIN/Umtermin) aus einer
 * WhatsApp-Nachricht. Die match-Logik ist Sache des Callers (matchInboundToFall).
 *
 * Reihenfolge wie im Twilio-Webhook:
 *   1. embed-B Resolution (stale nur_gutachter-Termin) — frueh-return bei Treffer
 *   2. Termin-Bestaetigung (naechster zukuenftiger Termin des Falls)
 *   3. Nein/Umtermin-Notification an Kundenbetreuer
 *
 * Alle Sub-Writes (Timeline, sendCommunication, createNotification) sind
 * non-critical und werden mit .catch(() => {}) gewrappt.
 */
export async function processInboundText(
  db: ReturnType<typeof createAdminClient>,
  args: {
    fromPhone: string
    body: string
    match: MatchResult
  },
): Promise<{ handled: boolean }> {
  const { fromPhone, body, match } = args
  const intent = detectIntent(body)

  if (intent === 'unknown') {
    return { handled: false }
  }

  const matchedFallId = match.fallId
  const matchedLeadId = match.leadId

  // ─── 1) embed-B Resolution ────────────────────────────────────────────────
  // Identisch zur Twilio-Route: JA/NEIN auf ueberfaelligen nur_gutachter-Termin.
  if (
    (intent === 'termin_bestaetigung_ja' || intent === 'termin_bestaetigung_nein') &&
    (matchedFallId || matchedLeadId)
  ) {
    try {
      const candidateFallIds = Array.from(
        new Set([
          ...(match.candidates ?? []).map((c) => c.id),
          ...(matchedFallId ? [matchedFallId] : []),
        ]),
      )
      const orParts: string[] = []
      if (candidateFallIds.length) orParts.push(`fall_id.in.(${candidateFallIds.join(',')})`)
      if (matchedLeadId) orParts.push(`lead_id.eq.${matchedLeadId}`)

      if (orParts.length > 0) {
        const { data: staleKandidaten } = await db
          .from('gutachter_termine')
          // T3-slice-2c: claims.status -> operative_status (Terminal-Gate via istClaimGeschlossen).
          .select('id, claim_id, fall_id, lead_id, claims:claim_id(service_typ, operative_status)')
          .or(orParts.join(','))
          .lt('end_zeit', new Date().toISOString())
          .is('durchgefuehrt_am', null)
          .is('sv_no_show_am', null)
          .is('sv_ablehnung_am', null)
          .not('status', 'in', TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE)
          .order('end_zeit', { ascending: false })
          .limit(5)

        // nur_gutachter + Claim nicht terminal (Nested-FK kann Array/Objekt sein).
        const staleTermin = (staleKandidaten ?? []).find((t) => {
          const claim = Array.isArray(t.claims) ? t.claims[0] : t.claims
          const svc = (claim?.service_typ as string | null) ?? null
          const opSt = (claim?.operative_status as string | null) ?? null
          return svc === 'nur_gutachter' && !istClaimGeschlossen({ operativeStatus: opSt })
        })

        if (staleTermin?.claim_id) {
          const terminId = staleTermin.id as string
          const fallId = (staleTermin.fall_id as string | null) ?? null

          if (intent === 'termin_bestaetigung_ja') {
            // JA: Gutachter war da — Termin abschliessen + Claim terminal.
            // CMM-49: kundeId via claims.geschaedigter_user_id (claim_id im Scope; NON-Auth
            // byUserId-Attribution, 0-diff zu faelle.kunde_id) -> faelle-frei.
            const { data: kundeClaim } = await db
              .from('claims')
              .select('geschaedigter_user_id')
              .eq('id', staleTermin.claim_id as string)
              .maybeSingle()
            const kundeId: string | null =
              (kundeClaim?.geschaedigter_user_id as string | null) ?? null
            await closeNurGutachterTerminAlsDurchgefuehrt(db, {
              terminId,
              claimId: staleTermin.claim_id as string,
              byUserId: kundeId,
              grund: 'Termin durchgefuehrt (vom Kunden per WhatsApp bestaetigt)',
            })
            if (fallId) {
              try {
                await db.from('timeline').insert({
                  fall_id: fallId,
                  typ: 'termin',
                  titel: 'Kunde bestätigt: Gutachter war da (WhatsApp)',
                  beschreibung: `Der Kunde hat per WhatsApp ("${body}") bestätigt, dass der Gutachter zum Termin erschienen ist. Termin als durchgeführt verbucht.`,
                })
              } catch { /* non-critical */ }
            }
            await sendCommunication('chat_fallback_kunde', {
              telefon: fromPhone,
              '1': '',
              '2': 'Danke! Wir haben notiert, dass Ihr Gutachter da war. Sie hören von uns, sobald das Gutachten vorliegt.',
            }).catch(() => {})
          } else {
            // NEIN: Gutachter nicht erschienen — Klaerungs-Task fuer Dispatch.
            await createEmbedBKlaerungTask(db, {
              terminId,
              fallId,
              leadId: (staleTermin.lead_id as string | null) ?? matchedLeadId,
              grund: 'kunde_meldet_sv_no_show',
            })
            if (fallId) {
              try {
                await db.from('timeline').insert({
                  fall_id: fallId,
                  typ: 'termin',
                  titel: 'Kunde meldet: Gutachter nicht erschienen (WhatsApp)',
                  beschreibung: `Der Kunde hat per WhatsApp ("${body}") gemeldet, dass der Gutachter nicht zum Termin erschienen ist. Dispatch prüft und vermittelt einen neuen Termin.`,
                })
              } catch { /* non-critical */ }
            }
            await sendCommunication('chat_fallback_kunde', {
              telefon: fromPhone,
              '1': '',
              '2': 'Verstanden — wir prüfen das und melden uns kurz für einen neuen Terminvorschlag.',
            }).catch(() => {})
          }

          return { handled: true }
        }
      }
    } catch (err) {
      // Fall-through: bei Fehler NICHT frueh-returnen, damit Termin-Bestaetigung greift.
      console.error('[process-inbound-text] embed-B Resolution Fehler:', err instanceof Error ? err.message : err)
    }
  }

  // ─── 2) Termin-Bestaetigung (zukuenftiger Termin) ─────────────────────────
  if (matchedFallId && intent === 'termin_bestaetigung_ja') {
    const { data: naechsterTermin } = await db
      .from('gutachter_termine')
      .select('id')
      .or(bezugOrExpr('fall', matchedFallId))
      .gte('start_zeit', new Date().toISOString())
      .order('start_zeit', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (naechsterTermin) {
      // Der Kunde hat gerade per Nachricht zugesagt. Bleibt der Write aus, steht der
      // Termin weiter auf 'reserviert' und gilt als unbestaetigt.
      const { error: bestaetigFehler } = await db.from('gutachter_termine')
        .update({ status: 'bestaetigt' })
        .eq('id', naechsterTermin.id)
        // 'angefragt' ist ein reparatur_termine-Wert (nicht im gutachter_termine-CHECK) — toter Filter.
        .in('status', ['reserviert'])
      if (bestaetigFehler) {
        console.error(`[inbound] Termin-Zusage nicht gespeichert (Termin ${naechsterTermin.id}):`, bestaetigFehler.message)
      }

      try {
        await db.from('timeline').insert({
          fall_id: matchedFallId,
          typ: 'whatsapp-inbound',
          titel: 'Kunde hat Termin bestätigt (WhatsApp)',
          beschreibung: body,
        })
      } catch { /* non-critical */ }

      await sendCommunication('chat_fallback_kunde', {
        telefon: fromPhone,
        '1': '',
        '2': 'Vielen Dank! Wir haben Ihre Bestätigung erhalten. Bis bald.',
      }).catch(() => {})

      return { handled: true }
    }
  }

  // ─── 3) Nein / Umtermin — Notification an Kundenbetreuer ──────────────────
  if (matchedFallId && (intent === 'termin_bestaetigung_nein' || intent === 'umtermin')) {
    const txtClaimId = await resolveClaimId(db, matchedFallId)
    const { data: fallClaim } = txtClaimId
      ? await db.from('claims').select('kundenbetreuer_id, claim_nummer').eq('id', txtClaimId).maybeSingle()
      : { data: null }
    const fallKb = fallClaim?.kundenbetreuer_id as string | null | undefined

    if (fallKb) {
      const { createNotification } = await import('@/lib/notifications')
      createNotification(
        fallKb,
        'kunde-termin-abgelehnt',
        `Kunde lehnt Termin ab: Fall ${fallClaim?.claim_nummer ?? matchedFallId.slice(0, 8)}`,
        `WhatsApp-Antwort: "${body}". Bitte Kunde für neuen Termin kontaktieren.`,
        `/faelle/${matchedFallId}`,
      ).catch(() => {})
    }

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': 'Verstanden. Wir melden uns kurz für einen neuen Terminvorschlag.',
    }).catch(() => {})

    return { handled: true }
  }

  return { handled: false }
}
