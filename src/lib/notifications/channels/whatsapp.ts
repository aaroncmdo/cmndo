// AAR-498 N3: Echter WhatsApp-Channel-Handler. Löst Event×Rolle via
// templates/whatsapp.ts auf eine Twilio-TemplateName + ContentVariables auf
// und dispatched über den bestehenden sendWhatsAppTemplate-Helper
// (src/lib/whatsapp/send-template.ts). Twilio-Content-API wenn SID gesetzt,
// Legacy-Text-Fallback sonst.
//
// Recipient-Phone kommt aus profiles.telefon. Kein telefon → skipped.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send-template'
import { resolveWhatsAppTemplate } from '../templates/whatsapp'
import type { ChannelHandler } from './types'

async function lookupPhone(userId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('profiles')
    .select('telefon')
    .eq('id', userId)
    .maybeSingle()
  return (data?.telefon as string | null) ?? null
}

export const whatsappHandler: ChannelHandler = async (input) => {
  const phone = await lookupPhone(input.recipientUserId)
  if (!phone) {
    return { success: false, skipReason: 'no_phone_for_recipient' }
  }

  const mapping = await resolveWhatsAppTemplate(
    input.eventType,
    input.recipientRole,
    input.payload,
    input.recipientUserId,
    input.event.fall_id,
  )
  if (!mapping) {
    return { success: false, skipReason: 'no_template_mapping' }
  }

  const result = await sendWhatsAppTemplate(phone, mapping.template, mapping.variables)
  if (result.success) {
    return { success: true, externalId: result.sid }
  }
  return { success: false, errorMessage: result.error ?? 'twilio send failed' }
}
