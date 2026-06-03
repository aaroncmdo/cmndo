import { type TemplateName } from './template-sids'
import { getLegacyTemplateText } from './legacy-texts'
import { sendWhatsApp } from '../whatsapp'

// 2026-06-02: WhatsApp laeuft vollstaendig ueber Baileys (Text-only). Genehmigte
// Twilio-Content-Templates entfallen — jede Nachricht geht als gerenderter
// Legacy-Text ueber den Baileys-Service.
export async function sendWhatsAppTemplate(
  to: string,
  templateName: TemplateName,
  variables: Record<string, string>,
  _absender_kb_id?: string,
  locale: string = 'de',
): Promise<{ success: boolean; sid?: string; error?: string; provider: 'baileys' }> {
  const legacyText = getLegacyTemplateText(templateName, variables, locale)
  if (!legacyText) {
    console.warn(`[whatsapp] Kein Text für Template '${templateName}', skip`)
    return { success: false, error: 'no_legacy_text', provider: 'baileys' }
  }
  const result = await sendWhatsApp(to, legacyText)
  return { ...result, provider: 'baileys' }
}
