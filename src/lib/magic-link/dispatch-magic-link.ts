// AAR-899: Magic-Link-Versand mit Kanal-Switch — WhatsApp bevorzugt,
// Email-Fallback. Wiederverwendet das existierende WhatsApp-Subsystem
// (src/lib/whatsapp/{availability,baileys-client}) statt eigenen Code.
//
// Pattern aus src/lib/whatsapp/send.ts:
//   1. WhatsApp-Verfuegbarkeit aus DB-Cache lesen (whatsapp_verfuegbar /
//      whatsapp_geprueft_am auf leads). Bei Cache-Miss live nachfragen.
//   2. Wenn verfuegbar → Baileys /send.
//   3. Bei Fehler oder nicht verfuegbar → Email-Fallback via existing
//      sendMiniWizardMagicLink (AAR-902).
//
// Lokal-Dev ohne BAILEYS_BASE_URL: existing baileys-client liefert
// service_unavailable → fall durch zu Email.
//
// Spec: docs/14.05.2026/mini-wizard-magic-link-konzept.md §Magic-Link-Versand.

import {
  getCachedAvailability,
  checkAndCacheAvailability,
} from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendMiniWizardMagicLink } from '@/lib/email/google/flows'

export type DispatchKanal = 'whatsapp' | 'email' | 'failed'

export type DispatchResult = {
  kanal: DispatchKanal
  sent: boolean
  detail?: string
}

function buildWhatsAppText(opts: {
  vorname: string | null
  flowUrl: string
}): string {
  const greet = opts.vorname ? `Hi ${opts.vorname}` : 'Hi'
  return [
    `${greet}, danke für deine Schadenmeldung bei Claimondo.`,
    '',
    'Hier dein sicherer Login-Link (gültig 72 Stunden):',
    opts.flowUrl,
    '',
    'Mit einem Klick legst du SA + Vollmacht ab und kommst direkt in dein Portal.',
  ].join('\n')
}

export async function dispatchMagicLink(opts: {
  leadId: string
  telefon: string
  email: string
  vorname: string | null
  flowUrl: string
}): Promise<DispatchResult> {
  // Schritt 1: WA-Verfuegbarkeit aus Cache. Wenn leer, jetzt nachfragen —
  // sendNachricht (lib/whatsapp/send.ts) folgt dem gleichen Pattern.
  let wa = await getCachedAvailability('lead', opts.leadId)
  if (wa.geprueftAm === null && opts.telefon) {
    const fresh = await checkAndCacheAvailability('lead', opts.leadId, opts.telefon)
    wa = { verfuegbar: fresh.verfuegbar, geprueftAm: fresh.geprueftAm }
  }

  // Schritt 2: WA-Send wenn verfuegbar
  if (wa.verfuegbar === true) {
    const sent = await sendWhatsAppText(
      opts.telefon,
      buildWhatsAppText({ vorname: opts.vorname, flowUrl: opts.flowUrl }),
    )
    if (sent.ok) {
      return {
        kanal: 'whatsapp',
        sent: true,
        detail: sent.messageId ?? '',
      }
    }
    // WA-Send fail → Email-Fallback
  }

  // Schritt 3: Email-Fallback (existierendes Template aus AAR-902)
  const email = await sendMiniWizardMagicLink(opts.leadId, opts.flowUrl)
  if (email.success) {
    return { kanal: 'email', sent: true }
  }
  return {
    kanal: 'failed',
    sent: false,
    detail: email.error ?? 'Email-Versand fehlgeschlagen',
  }
}
