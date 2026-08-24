// KFZ-201: Central Communications — sendCommunication
// Routes all communication triggers through the COMMUNICATION_REGISTRY.
// Use this instead of calling sendWhatsApp / sendEmail directly.

import { COMMUNICATION_REGISTRY } from './registry'
import type { TemplateName } from '@/lib/whatsapp/template-sids'

function buildMessage(description: string, data: Record<string, string>): string {
  // Simple fallback: return description + available data fields
  const lines = [description]
  if (data.vorname) lines.push(`Empfaenger: ${data.vorname}`)
  return lines.join('\n')
}

/**
 * Zentraler Versand über das COMMUNICATION_REGISTRY.
 *
 * ⚠ Die beiden Kanäle verhalten sich im Fehlerfall UNTERSCHIEDLICH — bewusst, aus Bestand:
 *  - **WhatsApp wirft** (s.u., AAR-117). 38 der 53 Trigger laufen darüber, und Aufrufer wie
 *    `sendFlowLink` verlassen sich darauf, dass sie `wa_gesendet` NICHT auf true setzen.
 *  - **Email wirft NICHT.** Ein Wurf würde hier echten Schaden anrichten: Ein Teil der 19
 *    Aufrufstellen der 15 email-only-Trigger steht in Schleifen OHNE try (z.B.
 *    `cron/abrechnungen-faellig-check` — verschachtelt über Abrechnungen × Admins). Ein
 *    Abbruch dort ließe die restlichen Fälle der Schleife ungesendet — schlimmer als der
 *    bisherige Zustand.
 *
 * Stattdessen liefert die Funktion das Ergebnis ZURÜCK. Rückwärtskompatibel: Wer den Wert
 * ignoriert, verhält sich exakt wie bisher; wer ihn prüft, kann Versand-Marker an den
 * Erfolg koppeln (siehe `cron/netzwerk-abo-dunning`).
 *
 * Hintergrund: Die 15 email-only-Trigger waren im Fehlerfall zuvor spurlos — nur eine
 * Logzeile auf dem VPS, keine DB-Zeile, kein Retry. Betroffen sind u.a. beide
 * Monatsabrechnungen, die Abo-Mahnung und die Admin-Alarme für Backup-/Einzugsfehler.
 * Details: Marker `AUDIT-email-sends-schlagen-still-fehl`.
 */
export type SendResult = { ok: boolean; error?: string }

export async function sendCommunication(
  triggerName: string,
  data: Record<string, string>,
  options?: { forceEmail?: boolean; skipWhatsapp?: boolean; locale?: string; allowInternalRecipient?: boolean },
): Promise<SendResult> {
  // options is intentionally simple — Baileys routing is transparent to callers
  const config = COMMUNICATION_REGISTRY[triggerName]
  if (!config) {
    console.warn(`[COMM] Unknown trigger: ${triggerName}`)
    return { ok: false, error: `Unknown trigger: ${triggerName}` }
  }

  // ─── WhatsApp ──────────────────────────────────────────────────────────
  // AAR-117: Return-Werte von sendWhatsAppTemplate/sendWhatsApp auswerten und
  // bei success=false Exception werfen, damit Aufrufer (z.B. sendFlowLink)
  // wa_gesendet NICHT auf true setzen und keinen Timeline-Eintrag erzeugen.
  if (config.channel.includes('whatsapp') && !options?.skipWhatsapp && data.telefon) {
    let result: { success: boolean; error?: string } | null = null

    if (config.whatsapp_template_name) {
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp/send-template')
      // Build numbered variables from data — callers pass '1', '2', ... keys
      const variables: Record<string, string> = {}
      for (const [k, v] of Object.entries(data)) {
        variables[k] = v
      }
      result = await sendWhatsAppTemplate(
        data.telefon,
        config.whatsapp_template_name as TemplateName,
        variables,
        data.absender_kb_id,
        options?.locale ?? 'de',
      )
    } else {
      // Freitext-WhatsApp über den Baileys-Service (Twilio 2026-06-02 entfernt).
      // sendWhatsApp ist jetzt der Baileys-Leaf inkl. E.164-Normalisierung.
      const message = buildMessage(config.description, data)
      const { sendWhatsApp } = await import('@/lib/whatsapp')
      result = await sendWhatsApp(data.telefon, message)
    }

    if (!result.success) {
      const errorMsg = `[COMM] WhatsApp failed for ${triggerName}: ${result.error ?? 'Unbekannter Fehler'}`
      console.error(errorMsg)
      throw new Error(errorMsg)
    }
  }

  // ─── Email ─────────────────────────────────────────────────────────────
  if ((config.channel.includes('email') || options?.forceEmail) && data.email) {
    try {
      const { sendEmail } = await import('@/lib/email/google/client')
      await sendEmail({
        to: data.email,
        subject: data.subject || config.description,
        html: data.html || `<p>${buildMessage(config.description, data)}</p>`,
        template: triggerName,
        empfaengerTyp: config.recipient === 'kunde' ? 'kunde'
          : config.recipient === 'sv' ? 'sv'
          : config.recipient === 'kanzlei' ? 'kanzlei'
          : 'admin',
        fallId: data.fall_id || null,
        // Admin-getriggerte 1:1-Transaktionsmails (z.B. mitarbeiter_einladung) an interne
        // @claimondo.de-Empfaenger duerfen die Send-Isolation umgehen — der interne
        // Empfaenger IST die gewollte Zielperson (analog Makler-/Werkstatt-Login-Mail).
        allowInternalRecipient: options?.allowInternalRecipient,
      })
    } catch (err) {
      // Kein throw — s. Kopf-Kommentar (Schleifen ohne try). Der Aufrufer bekommt den
      // Fehlschlag stattdessen im Rückgabewert und kann seinen Versand-Marker daran binden.
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[COMM] Email failed for ${triggerName}:`, err)
      return { ok: false, error: msg }
    }
  }

  console.log(`[COMM] ${triggerName} → ${config.channel} an ${config.recipient}`)
  return { ok: true }
}
