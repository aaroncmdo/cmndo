// AAR-183: SMS-Versand über Twilio Content API mit derselben ContentSid.
// Twilio rendert automatisch den `twilio/text`-Fallback des Templates wenn
// wir an eine E.164-Nummer (ohne whatsapp:-Prefix) senden. Kein separates
// SMS-Template nötig.

import { getTemplateSid, type TemplateName } from './template-sids'

export async function sendSmsTemplate(
  to: string,
  templateName: TemplateName,
  variables: Record<string, string>,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const contentSid = getTemplateSid(templateName)
  if (!contentSid) {
    return { success: false, error: 'Kein ContentSid für Template ' + templateName }
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const smsFrom = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !authToken || !smsFrom) {
    return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM oder MESSAGING_SERVICE_SID)' }
  }
  // AAR-705: 21660-Schutz — die WhatsApp-Sandbox-Nummer ist KEINE
  // SMS-fähige Sender-Nummer. Wenn TWILIO_SMS_FROM versehentlich auf
  // +14155238886 (Sandbox-WA) steht, lehnt Twilio mit 21660 ab. Statt
  // den Twilio-Crash durchreichen → klare Fehlermeldung.
  if (smsFrom.includes('14155238886')) {
    return {
      success: false,
      error: 'TWILIO_SMS_FROM zeigt auf die WhatsApp-Sandbox-Nummer (+14155238886) — die kann keine SMS senden. Bitte in Vercel-Env eine SMS-fähige Twilio-Nummer setzen.',
    }
  }

  // E.164 normalisieren
  let normalTo = to.replace(/\s/g, '')
  if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
  else if (normalTo.startsWith('00')) normalTo = '+' + normalTo.slice(2)
  if (!normalTo.startsWith('+')) normalTo = '+' + normalTo

  const body = new URLSearchParams()
  // MessagingServiceSid überschreibt From falls gesetzt (Twilio-Best-Practice)
  if (smsFrom.startsWith('MG')) {
    body.set('MessagingServiceSid', smsFrom)
  } else {
    body.set('From', smsFrom)
  }
  body.set('To', normalTo)
  body.set('ContentSid', contentSid)
  body.set('ContentVariables', JSON.stringify(variables))
  // StatusCallback für Delivery-Tracking (AAR-183 Phase B)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  body.set('StatusCallback', `${baseUrl}/api/webhooks/twilio/status`)

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    )
    const data = await resp.json()
    if (data.sid) return { success: true, sid: data.sid }
    return { success: false, error: data.message ?? 'Twilio SMS error' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
