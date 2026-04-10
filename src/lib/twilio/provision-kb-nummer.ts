import { createAdminClient } from '@/lib/supabase/admin'

// KFZ-182 Phase A: Twilio-Nummer pro Kundenbetreuer provisionieren.
// ACHTUNG: Kostet ~1€/Monat pro Nummer. Nur manuell pro Profile via Admin-Button.

const WEBHOOK_URL = 'https://cmndo.vercel.app/api/twilio/inbound-kb-whatsapp'

export async function provisionKbNummer(
  profileId: string,
  country = 'DE',
): Promise<{ phoneNumber: string; sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) throw new Error('Twilio credentials nicht konfiguriert')

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  // 1. Verfügbare Nummer suchen
  const searchResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/Mobile.json?Limit=1&SmsEnabled=true`,
    { headers: { Authorization: `Basic ${auth}` } },
  )
  const searchData = await searchResp.json()
  const available = searchData.available_phone_numbers?.[0]
  if (!available) throw new Error(`Keine verfügbare Nummer in ${country}`)

  // 2. Nummer kaufen + Webhook setzen
  const buyBody = new URLSearchParams()
  buyBody.set('PhoneNumber', available.phone_number)
  buyBody.set('SmsUrl', WEBHOOK_URL)
  buyBody.set('SmsMethod', 'POST')

  const buyResp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buyBody.toString(),
    },
  )
  const buyData = await buyResp.json()
  if (!buyData.sid) throw new Error(`Nummer kaufen fehlgeschlagen: ${buyData.message ?? JSON.stringify(buyData)}`)

  // 3. Profile updaten
  const db = createAdminClient()
  await db.from('profiles').update({
    twilio_whatsapp_nummer: buyData.phone_number,
    twilio_phone_sid: buyData.sid,
    twilio_nummer_provisioned_am: new Date().toISOString(),
  }).eq('id', profileId)

  return { phoneNumber: buyData.phone_number, sid: buyData.sid }
}

export async function releaseKbNummer(profileId: string): Promise<void> {
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles')
    .select('twilio_phone_sid')
    .eq('id', profileId)
    .single()

  if (profile?.twilio_phone_sid) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (accountSid && authToken) {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${profile.twilio_phone_sid}.json`,
        { method: 'DELETE', headers: { Authorization: `Basic ${auth}` } },
      ).catch(() => {})
    }
  }

  await db.from('profiles').update({
    twilio_whatsapp_nummer: null,
    twilio_phone_sid: null,
    twilio_nummer_provisioned_am: null,
  }).eq('id', profileId)
}
