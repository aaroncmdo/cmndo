// KFZ-184: Twilio Verify Client fuer SMS-2FA.
// Env: TWILIO_VERIFY_SERVICE_SID (Aaron legt Service in Twilio Console an).

const rateLimitMap = new Map<string, number>()

function getVerifyConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!accountSid || !authToken || !serviceSid) {
    throw new Error('Twilio Verify nicht konfiguriert: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_VERIFY_SERVICE_SID muessen gesetzt sein')
  }
  return { accountSid, authToken, serviceSid }
}

function normalizePhone(tel: string): string {
  let n = tel.replace(/\s/g, '')
  if (n.startsWith('0')) n = '+49' + n.slice(1)
  else if (n.startsWith('00')) n = '+' + n.slice(2)
  if (!n.startsWith('+')) n = '+' + n
  return n
}

export async function sendVerificationCode(telefon: string): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePhone(telefon)

  // Rate-Limit: max 1 send pro 60s pro Telefonnummer
  const lastSent = rateLimitMap.get(normalized) ?? 0
  if (Date.now() - lastSent < 60000) {
    return { success: false, error: 'Bitte 60 Sekunden warten bevor ein neuer Code gesendet wird' }
  }

  let accountSid: string, authToken: string, serviceSid: string
  try {
    ;({ accountSid, authToken, serviceSid } = getVerifyConfig())
  } catch {
    return { success: false, error: 'SMS-2FA nicht konfiguriert — bitte Administrator kontaktieren' }
  }

  try {
    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: normalized, Channel: 'sms' }),
      },
    )
    const data = await resp.json()
    if (data.status === 'pending') {
      rateLimitMap.set(normalized, Date.now())
      return { success: true }
    }
    return { success: false, error: data.message ?? 'SMS konnte nicht gesendet werden' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function checkVerificationCode(telefon: string, code: string): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePhone(telefon)
  let accountSid: string, authToken: string, serviceSid: string
  try {
    ;({ accountSid, authToken, serviceSid } = getVerifyConfig())
  } catch {
    return { success: false, error: 'SMS-2FA nicht konfiguriert' }
  }

  try {
    const resp = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: normalized, Code: code }),
      },
    )
    const data = await resp.json()
    if (data.status === 'approved') return { success: true }
    return { success: false, error: 'Ungültiger Code' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
