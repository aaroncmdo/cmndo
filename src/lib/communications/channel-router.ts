// AAR-183: Smart Channel Router — WA-first mit SMS-Fallback + Kanal-Präferenz.
//
// Ablauf:
//   1. Mode via ENV `CHANNEL_ROUTER_MODE` (sms_only | wa_first | auto)
//      - sms_only: Phase A. Bevor Meta unsere Templates approved.
//      - wa_first: Phase B. WA-Primary, SMS-Fallback wenn WA-Response failed.
//      - auto:    Phase C. Nutzt lead.bevorzugter_kanal als Primary-Hint;
//                 unbekannt → wa_first.
//   2. Bei Erfolg: lead/fall.bevorzugter_kanal wird persistiert (aus Historie
//      lernen ohne separate WA-Verifizierung).
//   3. Bei WA-Versand speichert Twilio unser StatusCallback — ein späterer
//      Failure (Meta schließt WA, Kunde hat kein WA) landet in
//      /api/webhooks/twilio/status, wo wir bevorzugter_kanal auf 'sms'
//      zurücksetzen können.
//
// Das Router-Modul bleibt bewusst dünn: es delegiert den tatsächlichen
// Twilio-Call an send-template.ts (WA) bzw. send-sms-template.ts (SMS).

import type { TemplateName } from '@/lib/whatsapp/template-sids'

export type ChannelResult = {
  success: boolean
  kanal?: 'whatsapp' | 'sms' | 'email'
  sid?: string
  error?: string
  versuche: Array<{ kanal: 'whatsapp' | 'sms' | 'email'; ok: boolean; error?: string }>
}

export type RecipientRef = {
  telefon?: string | null
  email?: string | null
  leadId?: string | null
  fallId?: string | null
  /** Aus DB gelesen. Wenn auto-Mode: bestimmt Primary. */
  bevorzugterKanal?: 'whatsapp' | 'sms' | 'email' | null
}

function routerMode(): 'sms_only' | 'wa_first' | 'auto' {
  const v = (process.env.CHANNEL_ROUTER_MODE ?? 'wa_first').toLowerCase()
  if (v === 'sms_only' || v === 'wa_first' || v === 'auto') return v
  return 'wa_first'
}

async function persistBevorzugterKanal(
  recipient: RecipientRef,
  kanal: 'whatsapp' | 'sms' | 'email',
): Promise<void> {
  if (!recipient.leadId && !recipient.fallId) return
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient()
    if (recipient.fallId) {
      // CMM-44 SP-B PR2a: bevorzugter_kanal lebt jetzt auf claims (SSoT).
      const { data: fallRow } = await db.from('faelle').select('claim_id').eq('id', recipient.fallId).maybeSingle()
      const claimId = (fallRow as { claim_id?: string | null } | null)?.claim_id ?? null
      if (claimId) {
        await db.from('claims').update({ bevorzugter_kanal: kanal }).eq('id', claimId)
      }
    }
    if (recipient.leadId) {
      await db.from('leads').update({ bevorzugter_kanal: kanal }).eq('id', recipient.leadId)
    }
  } catch (err) {
    // Non-critical: persisting failure darf den Versand nicht blocken
    console.warn('[AAR-183] persistBevorzugterKanal failed:', err)
  }
}

function orderChannels(
  mode: ReturnType<typeof routerMode>,
  recipient: RecipientRef,
  hasWhatsappTemplate: boolean,
): Array<'whatsapp' | 'sms' | 'email'> {
  const order: Array<'whatsapp' | 'sms' | 'email'> = []
  if (mode === 'sms_only') {
    if (recipient.telefon) order.push('sms')
    if (recipient.email) order.push('email')
    return order
  }
  if (mode === 'auto' && recipient.bevorzugterKanal) {
    // Bekannter Erfolgskanal hat Vorrang
    if (recipient.bevorzugterKanal === 'email' && recipient.email) order.push('email')
    else if (recipient.bevorzugterKanal === 'sms' && recipient.telefon) order.push('sms')
    else if (recipient.bevorzugterKanal === 'whatsapp' && recipient.telefon && hasWhatsappTemplate) {
      order.push('whatsapp')
    }
  }
  // WA-First als Default (oder Second-Choice wenn auto einen Hint hatte)
  if (recipient.telefon && hasWhatsappTemplate && !order.includes('whatsapp')) {
    order.push('whatsapp')
  }
  if (recipient.telefon && !order.includes('sms')) order.push('sms')
  if (recipient.email && !order.includes('email')) order.push('email')
  return order
}

/**
 * Sendet das Template über den „besten" Kanal laut CHANNEL_ROUTER_MODE.
 * Bei Phase-A (sms_only) und fehlendem Template-SID wird nichts gesendet —
 * der Aufrufer muss dann Legacy-Text per sendWhatsApp selbst bauen falls
 * nötig. Für die Standard-Templates ist das vernachlässigbar.
 */
export async function sendSmartChannel(
  templateName: TemplateName,
  variables: Record<string, string>,
  recipient: RecipientRef,
  options?: { absenderKbId?: string; emailSubject?: string; emailHtml?: string; emailText?: string },
): Promise<ChannelResult> {
  const mode = routerMode()
  const { getTemplateSid } = await import('@/lib/whatsapp/template-sids')
  const hasTemplate = !!getTemplateSid(templateName)
  const channels = orderChannels(mode, recipient, hasTemplate)

  const versuche: ChannelResult['versuche'] = []

  for (const kanal of channels) {
    if (kanal === 'whatsapp') {
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp/send-template')
      const r = await sendWhatsAppTemplate(
        recipient.telefon!,
        templateName,
        variables,
        options?.absenderKbId,
      )
      versuche.push({ kanal: 'whatsapp', ok: r.success, error: r.error })
      if (r.success) {
        await persistBevorzugterKanal(recipient, 'whatsapp')
        return { success: true, kanal: 'whatsapp', sid: r.sid, versuche }
      }
    } else if (kanal === 'sms') {
      const { sendSmsTemplate } = await import('@/lib/whatsapp/send-sms-template')
      const r = await sendSmsTemplate(recipient.telefon!, templateName, variables)
      versuche.push({ kanal: 'sms', ok: r.success, error: r.error })
      if (r.success) {
        await persistBevorzugterKanal(recipient, 'sms')
        return { success: true, kanal: 'sms', sid: r.sid, versuche }
      }
    } else if (kanal === 'email' && recipient.email) {
      try {
        const { sendEmail } = await import('@/lib/email/google/client')
        await sendEmail({
          to: recipient.email,
          subject: options?.emailSubject ?? `Claimondo — ${templateName}`,
          text: options?.emailText ?? 'Bitte in Ihrem Portal prüfen.',
          html: options?.emailHtml ?? `<p>${options?.emailText ?? 'Bitte in Ihrem Portal prüfen.'}</p>`,
          template: templateName,
          empfaengerTyp: 'kunde',
          fallId: recipient.fallId ?? null,
        })
        versuche.push({ kanal: 'email', ok: true })
        await persistBevorzugterKanal(recipient, 'email')
        return { success: true, kanal: 'email', versuche }
      } catch (err) {
        versuche.push({ kanal: 'email', ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return {
    success: false,
    error: 'Kein Kanal erfolgreich (' + versuche.map((v) => `${v.kanal}:${v.error ?? 'ok'}`).join(' / ') + ')',
    versuche,
  }
}
