// AAR-956: Plain-SMS-Versand (raw Body, KEIN Content-Template) — für den
// kanonischen Self-Service-FlowLink-Fallback (WA → SMS → Email).
//
// sendSmsTemplate (send-sms-template.ts) braucht eine ContentSid; der kanonische
// FlowLink ist aber ein Plain-Link ohne passendes Template (das flowlink_versand-
// Template braucht SV-Name + Termin). Daher dieser schlanke Body-Sender über
// dieselbe Twilio Messages API. Bewusst eigenständig, damit der getestete
// sendSmsTemplate-Pfad unangetastet bleibt.

/**
 * Normalisiert eine Telefonnummer auf E.164. `00` MUSS vor `0` geprüft werden,
 * sonst wird "0049…" als deutsche 0-Nummer fehlinterpretiert.
 */
export function normalizeE164(to: string): string {
  let n = to.replace(/\s/g, '')
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('0')) n = '+49' + n.slice(1)
  if (!n.startsWith('+')) n = '+' + n
  return n
}

/**
 * Sendet eine Plain-Text-SMS über Twilio. Result-Object (kein throw), damit der
 * Caller die Fallback-Kette steuern kann.
 */
export async function sendPlainSms(
  to: string,
  body: string,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const smsFrom = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !authToken || !smsFrom) {
    return { success: false, error: 'Twilio-SMS-Credentials fehlen (TWILIO_SMS_FROM oder MESSAGING_SERVICE_SID)' }
  }
  // AAR-705: 21660-Schutz — die WhatsApp-Sandbox-Nummer kann keine SMS senden.
  if (smsFrom.includes('14155238886')) {
    return { success: false, error: 'TWILIO_SMS_FROM zeigt auf die WhatsApp-Sandbox-Nummer (+14155238886) — kann keine SMS senden.' }
  }
  if (!to || to.trim().length < 6) return { success: false, error: 'Telefonnummer zu kurz' }
  if (!body || !body.trim()) return { success: false, error: 'Leerer SMS-Text' }

  const params = new URLSearchParams()
  // MessagingServiceSid überschreibt From falls gesetzt (Twilio-Best-Practice).
  if (smsFrom.startsWith('MG')) params.set('MessagingServiceSid', smsFrom)
  else params.set('From', smsFrom)
  params.set('To', normalizeE164(to))
  params.set('Body', body)
  // Delivery-Tracking-Callback (wie sendSmsTemplate, AAR-183 Phase B).
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  params.set('StatusCallback', `${baseUrl}/api/webhooks/twilio/status`)

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )
    const data = await resp.json()
    if (data.sid) return { success: true, sid: data.sid }
    return { success: false, error: data.message ?? 'Twilio SMS error' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
