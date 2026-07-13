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

export async function sendCommunication(
  triggerName: string,
  data: Record<string, string>,
  options?: { forceEmail?: boolean; skipWhatsapp?: boolean; locale?: string; allowInternalRecipient?: boolean },
): Promise<void> {
  // options is intentionally simple — Baileys routing is transparent to callers
  const config = COMMUNICATION_REGISTRY[triggerName]
  if (!config) {
    console.warn(`[COMM] Unknown trigger: ${triggerName}`)
    return
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
      console.error(`[COMM] Email failed for ${triggerName}:`, err)
    }
  }

  console.log(`[COMM] ${triggerName} → ${config.channel} an ${config.recipient}`)
}
