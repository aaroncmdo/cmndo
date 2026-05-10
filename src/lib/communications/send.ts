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
  options?: { forceEmail?: boolean; skipWhatsapp?: boolean },
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
      )
    } else {
      // Baileys-first: wenn Service erreichbar → Baileys, sonst Twilio-Fallback
      const message = buildMessage(config.description, data)
      const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
      const baileysResult = await sendWhatsAppText(data.telefon, message)
      if (baileysResult.ok) {
        result = { success: true }
      } else if (
        baileysResult.code === 'service_unavailable' ||
        baileysResult.code === 'baileys_not_connected' ||
        baileysResult.code === 'config_missing'
      ) {
        // Baileys nicht erreichbar → Twilio-Fallback
        const { sendWhatsApp } = await import('@/lib/whatsapp')
        result = await sendWhatsApp(data.telefon, message)
      } else {
        result = { success: false, error: baileysResult.error }
      }
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
      })
    } catch (err) {
      console.error(`[COMM] Email failed for ${triggerName}:`, err)
    }
  }

  console.log(`[COMM] ${triggerName} → ${config.channel} an ${config.recipient}`)
}
