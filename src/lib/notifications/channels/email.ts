// AAR-497 N2: Email-Channel-Handler. Löst Event×Rolle auf Subject + HTML auf
// und sendet über lib/email/google/client.ts (Resend ↔ SMTP-Fallback).

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'
import type { ChannelHandler } from './types'
import type { EventType } from '../types'

async function lookupEmail(userId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db.from('profiles').select('email').eq('id', userId).maybeSingle()
  return (data?.email as string | null) ?? null
}

type EmailTemplate = { subject: string; html: string }

function buildTemplate(
  eventType: EventType,
  payload: Record<string, unknown>,
  vorname: string,
): EmailTemplate {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const fallId = payload.fallId as string | undefined
  const fallLink = fallId ? `${base}/faelle/${fallId}` : base

  const greet = vorname ? `<p>Hallo ${vorname},</p>` : '<p>Hallo,</p>'
  const footer = `<p style="color:#888;font-size:12px;margin-top:24px">Claimondo — Ihr Schadenmanagement-Portal<br><a href="${base}">${base}</a></p>`

  switch (eventType) {
    case 'fall.created':
      return {
        subject: 'Ihr Fall wurde erfolgreich angelegt',
        html: `${greet}<p>Ihr Schadenfall wurde erfolgreich bei uns angelegt. Unser Team bearbeitet Ihren Fall und meldet sich in Kürze.</p><p><a href="${fallLink}">Fall im Portal ansehen</a></p>${footer}`,
      }
    case 'fall.sv_assigned':
      return {
        subject: 'Sachverständiger für Ihren Fall wurde zugewiesen',
        html: `${greet}<p>Für Ihren Schadenfall wurde ein Sachverständiger beauftragt. Sie erhalten in Kürze einen Terminvorschlag.</p><p><a href="${fallLink}">Fall im Portal ansehen</a></p>${footer}`,
      }
    case 'fall.storniert':
      return {
        subject: 'Ihr Fall wurde storniert',
        html: `${greet}<p>Ihr Schadenfall wurde leider storniert${payload.grund ? `: ${payload.grund}` : ''}. Bei Fragen wenden Sie sich bitte an unser Team.</p><p><a href="${base}/kontakt">Kontakt aufnehmen</a></p>${footer}`,
      }
    case 'sa.flow_sent': {
      const flowUrl = payload.flowLinkUrl as string | undefined
      return {
        subject: 'Bitte unterschreiben Sie Ihren Schadenauftrag',
        html: `${greet}<p>Wir haben Ihnen einen Schadenauftrag zur Unterschrift zugestellt. Bitte schließen Sie den Prozess ab, damit wir mit der Bearbeitung beginnen können.</p>${flowUrl ? `<p><a href="${flowUrl}" style="background:#0D1B3E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Jetzt unterschreiben</a></p>` : ''}<p><a href="${fallLink}">Fall im Portal ansehen</a></p>${footer}`,
      }
    }
    case 'termin.sv_bestaetigt': {
      const datum = payload.datum as string | undefined
      const uhrzeit = payload.uhrzeit as string | undefined
      const ort = payload.ort as string | undefined
      return {
        subject: 'Ihr Begutachtungstermin wurde bestätigt',
        html: `${greet}<p>Ihr Begutachtungstermin wurde bestätigt:</p><ul>${datum ? `<li><strong>Datum:</strong> ${datum}</li>` : ''}${uhrzeit ? `<li><strong>Uhrzeit:</strong> ${uhrzeit}</li>` : ''}${ort ? `<li><strong>Ort:</strong> ${ort}</li>` : ''}</ul><p><a href="${fallLink}">Details im Portal ansehen</a></p>${footer}`,
      }
    }
    case 'gutachten.fertig':
      return {
        subject: 'Ihr Gutachten ist fertig',
        html: `${greet}<p>Das Gutachten für Ihren Schadenfall wurde erstellt und steht Ihnen im Portal zur Verfügung.</p><p><a href="${fallLink}">Gutachten ansehen</a></p>${footer}`,
      }
    case 'kanzlei.uebergabe':
      return {
        subject: 'Ihr Fall wurde an die Kanzlei übergeben',
        html: `${greet}<p>Ihr Schadenfall wurde an unsere Kanzlei übergeben, die nun die rechtliche Durchsetzung Ihrer Ansprüche übernimmt. Wir halten Sie auf dem Laufenden.</p><p><a href="${fallLink}">Fall im Portal ansehen</a></p>${footer}`,
      }
    case 'regulierung.ergebnis': {
      const typ = payload.typ as string | undefined
      const betrag = payload.betragEur as number | undefined
      const labels: Record<string, string> = {
        voll: 'vollständig anerkannt',
        teilweise: 'teilweise anerkannt',
        kuerzung: 'mit Kürzung anerkannt',
        abgelehnt: 'abgelehnt',
      }
      return {
        subject: `Regulierungsergebnis: Ihr Anspruch wurde ${labels[typ ?? ''] ?? 'bearbeitet'}`,
        html: `${greet}<p>Die Regulierung Ihres Schadensfalls wurde abgeschlossen. Ergebnis: <strong>${labels[typ ?? ''] ?? typ}</strong>${betrag ? ` (${betrag.toFixed(2)} €)` : ''}.</p><p><a href="${fallLink}">Details im Portal ansehen</a></p>${footer}`,
      }
    }
    case 'auszahlung.veranlasst': {
      const betrag = payload.betragEur as number | undefined
      const tage = payload.erwarteteGutschriftTage as number | undefined
      return {
        subject: 'Auszahlung wurde veranlasst',
        html: `${greet}<p>Wir haben die Auszahlung${betrag ? ` von ${betrag.toFixed(2)} €` : ''} veranlasst. Die Gutschrift auf Ihrem Konto ist${tage ? ` in ca. ${tage} Werktagen` : ' in Kürze'} zu erwarten.</p><p><a href="${fallLink}">Fall im Portal ansehen</a></p>${footer}`,
      }
    }
    case 'makler.lead_eingegangen':
      return {
        subject: 'Neuer Lead eingegangen',
        html: `${greet}<p>Über Ihren Partnerlink ist ein neuer Lead eingegangen. Wir haben mit der Bearbeitung begonnen.</p><p><a href="${base}/makler">Im Makler-Portal ansehen</a></p>${footer}`,
      }
    case 'makler.provision_status': {
      const status = payload.status as string | undefined
      const betrag = payload.betragEur as number | undefined
      return {
        subject: `Provision ${status === 'freigegeben' ? 'freigegeben' : 'storniert'}`,
        html: `${greet}<p>Ihre Provision${betrag ? ` von ${betrag.toFixed(2)} €` : ''} wurde <strong>${status === 'freigegeben' ? 'freigegeben' : 'storniert'}</strong>.</p><p><a href="${base}/makler">Im Makler-Portal ansehen</a></p>${footer}`,
      }
    }
    default:
      return {
        subject: 'Neue Benachrichtigung von Claimondo',
        html: `${greet}<p>Es gibt eine neue Aktualisierung zu Ihrem Fall.</p><p><a href="${fallLink}">Im Portal ansehen</a></p>${footer}`,
      }
  }
}

export const emailHandler: ChannelHandler = async (input) => {
  const email = await lookupEmail(input.recipientUserId)
  if (!email) {
    return { success: false, skipReason: 'no_email_for_recipient' }
  }

  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('vorname')
    .eq('id', input.recipientUserId)
    .maybeSingle()
  const vorname = (profile?.vorname as string | null) ?? ''

  const fallId = (input.payload.fallId ?? input.event.fall_id) as string | undefined
  const { subject, html } = buildTemplate(input.eventType, input.payload, vorname)

  try {
    const result = await sendEmail({
      to: email,
      subject,
      html,
      fallId: fallId ?? null,
      empfaengerTyp:
        input.recipientRole === 'sachverstaendiger'
          ? 'sv'
          : input.recipientRole === 'kunde'
            ? 'kunde'
            : 'admin',
      template: input.eventType,
    })
    return { success: true, externalId: result.messageId }
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    }
  }
}
