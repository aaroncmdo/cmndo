import { getTemplateSid, type TemplateName } from './template-sids'
import { getLegacyTemplateText } from './legacy-texts'
import { sendWhatsApp } from '../whatsapp'

// KFZ-181: sendWhatsAppTemplate — Twilio Content API mit Legacy-Fallback.
//
// Wenn ein Content-SID fuer den Template-Namen gesetzt ist (Env-Var):
//   → Twilio Content API mit contentSid + contentVariables
// Sonst:
//   → Legacy-Text aus getLegacyTemplateText() + existing sendWhatsApp()

export async function sendWhatsAppTemplate(
  to: string,
  templateName: TemplateName,
  variables: Record<string, string>,
  absender_kb_id?: string,
): Promise<{ success: boolean; sid?: string; error?: string; provider: 'twilio-template' | 'twilio-legacy' }> {
  const contentSid = getTemplateSid(templateName)

  if (contentSid) {
    // ─── Twilio Content API (Template genehmigt) ──────────────────
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    let from = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

    // KFZ-182: KB-eigene Nummer als Absender wenn vorhanden
    if (absender_kb_id) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const db = createAdminClient()
        const { data: kb } = await db.from('profiles')
          .select('twilio_whatsapp_nummer')
          .eq('id', absender_kb_id)
          .single()
        if (kb?.twilio_whatsapp_nummer) from = kb.twilio_whatsapp_nummer
      } catch { /* fallback to default */ }
    }

    if (!accountSid || !authToken) {
      return { success: false, error: 'Twilio credentials missing', provider: 'twilio-template' }
    }

    // Normalize phone
    let normalTo = to.replace(/\s/g, '')
    if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
    else if (normalTo.startsWith('00')) normalTo = '+' + normalTo.slice(2)
    if (!normalTo.startsWith('+')) normalTo = '+' + normalTo

    try {
      const body = new URLSearchParams()
      body.set('From', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`)
      body.set('To', `whatsapp:${normalTo}`)
      body.set('ContentSid', contentSid)
      // AAR-232: Nur nummerierte Keys ('1','2',...) als ContentVariables —
      // sendCommunication gibt auch 'telefon' mit, das Twilio Content API
      // als "Invalid Parameter" ablehnt.
      const contentVars: Record<string, string> = {}
      for (const [k, v] of Object.entries(variables)) {
        if (/^\d+$/.test(k)) contentVars[k] = v
      }
      body.set('ContentVariables', JSON.stringify(contentVars))
      // AAR-183: StatusCallback für Delivery-Fehler-Erkennung (bevorzugter_kanal
      // wird zurückgesetzt wenn WA scheitert, sodass der nächste Send auf SMS
      // fällt ohne dass der MA das manuell pflegen muss).
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
      body.set('StatusCallback', `${baseUrl}/api/webhooks/twilio/status`)

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      )

      const data = await resp.json()
      if (data.sid) {
        return { success: true, sid: data.sid, provider: 'twilio-template' }
      }
      // AAR-704: Volle Twilio-Antwort loggen + sprechenden Fehler bauen.
      // „Invalid Parameter" allein hilft niemandem — Twilio sagt eigentlich
      // welcher Parameter (code, more_info, status). Plus Hinweis bei den
      // typischen Fallen: Sandbox-Sender ohne Content-API-Support oder
      // nicht-opted-in Empfänger.
      console.error('[whatsapp:template] Twilio fail', {
        templateName,
        contentSid,
        from,
        to: normalTo,
        contentVars,
        twilioCode: data.code,
        twilioMessage: data.message,
        moreInfo: data.more_info,
        status: data.status,
      })
      const isSandbox = from.includes('14155238886')
      const hint = isSandbox
        ? ' (Sandbox-Sender unterstützt keine Content-Templates oder Empfänger nicht im Sandbox opted-in mit „join …")'
        : ''
      const detail = data.code ? `[${data.code}] ${data.message}` : data.message ?? 'Twilio error'
      return {
        success: false,
        error: `${detail}${hint}`,
        provider: 'twilio-template',
      }
    } catch (err) {
      console.error('[whatsapp:template] fetch fail', err)
      return { success: false, error: String(err), provider: 'twilio-template' }
    }
  }

  // ─── Legacy-Fallback (kein SID gesetzt) ───────────────────────
  const legacyText = getLegacyTemplateText(templateName, variables)
  if (!legacyText) {
    console.warn(`[KFZ-181] Kein Legacy-Text fuer Template '${templateName}', skip`)
    return { success: false, error: 'no_legacy_text', provider: 'twilio-legacy' }
  }

  const result = await sendWhatsApp(to, legacyText)
  return { ...result, provider: 'twilio-legacy' }
}
