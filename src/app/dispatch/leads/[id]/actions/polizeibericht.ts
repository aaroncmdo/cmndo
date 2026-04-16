'use server'

// AAR-263: Polizeibericht-Upload-Anfrage — 1:1 Pattern wie ZB1 (AAR-182).
// Setzt polizeibericht_token + polizeibericht_status='gesendet' und schickt
// das Template `polizeibericht_upload_anfrage` (WA) bzw. SMS/Email.
// Der Kunde antwortet mit Foto direkt per WhatsApp — der Twilio-Inbound-
// Webhook erkennt das Media anhand der Telefonnummer + offenem
// polizeibericht_status und löst Storage-Upload aus.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Kanal = 'whatsapp' | 'sms' | 'email'
type Result = { success: boolean; error?: string }

async function requireDispatcher(supabase: Awaited<ReturnType<typeof createClient>>) {
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'dispatch' && rolle !== 'kundenbetreuer') {
    return { error: 'Nur Dispatch/KB/Admin darf Polizeibericht anfordern' as const }
  }
  return { user, rolle }
}

export async function triggerPolizeiberichtUploadRequest(
  leadId: string,
  kanal: Kanal,
  telefonOverride?: string | null,
): Promise<Result> {
  const supabase = await createClient()
  const auth = await requireDispatcher(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, nachname, telefon, email, polizeibericht_token')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const telefon = (telefonOverride?.trim() || lead.telefon) ?? null
  if ((kanal === 'whatsapp' || kanal === 'sms') && !telefon) {
    return { success: false, error: 'Keine Telefonnummer am Lead' }
  }
  if (kanal === 'email' && !lead.email) {
    return { success: false, error: 'Keine Email-Adresse am Lead' }
  }

  const { randomBytes } = await import('crypto')
  const token = lead.polizeibericht_token ?? randomBytes(24).toString('hex')

  const now = new Date().toISOString()
  const { error: updErr } = await db
    .from('leads')
    .update({
      polizeibericht_token: token,
      polizeibericht_status: 'gesendet',
      polizeibericht_gesendet_am: now,
      updated_at: now,
    })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  // Versand (non-critical für den Status — wenn das Template fehlt oder
  // Twilio down ist, soll der Dispatcher nicht komplett blockiert werden).
  try {
    if (kanal === 'whatsapp') {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('polizeibericht_upload_anfrage', {
        telefon: telefon!,
        '1': lead.vorname ?? '',
      })
    } else if (kanal === 'sms') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const smsFrom = process.env.TWILIO_SMS_FROM
      if (!accountSid || !authToken || !smsFrom) {
        return { success: false, error: 'Twilio-SMS-Credentials fehlen' }
      }
      let normalTo = telefon!.replace(/\s/g, '')
      if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
      else if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
      const body = `Hallo ${lead.vorname ?? ''}, bitte schicken Sie uns ein Foto der polizeilichen Unfallmitteilung (der Zettel den Sie von der Polizei bekommen haben) als Antwort auf diese Nachricht. Claimondo.`
      const params = new URLSearchParams()
      params.set('From', smsFrom)
      params.set('To', normalTo)
      params.set('Body', body)
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        },
      )
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return { success: false, error: `Twilio-SMS Fehler ${resp.status}: ${text.slice(0, 200)}` }
      }
    } else if (kanal === 'email') {
      const { sendEmail } = await import('@/lib/email/google/client')
      const text = `Hallo ${lead.vorname ?? ''},\n\nBitte antworten Sie kurz auf diese Mail mit einem Foto der polizeilichen Unfallmitteilung (der Zettel den Sie von der Polizei bekommen haben). Wir lesen die Daten automatisch aus und setzen Ihren Fall fort.\n\nDanke!\nClaimondo`
      await sendEmail({
        to: lead.email!,
        subject: 'Foto Ihrer polizeilichen Unfallmitteilung — Claimondo',
        text,
        html: `<p>Hallo ${lead.vorname ?? ''},</p><p>Bitte antworten Sie kurz auf diese Mail mit einem Foto der polizeilichen Unfallmitteilung (der Zettel den Sie von der Polizei bekommen haben). Wir lesen die Daten automatisch aus und setzen Ihren Fall fort.</p><p>Danke!<br/>Claimondo</p>`,
      })
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Versand fehlgeschlagen',
    }
  }

  await db.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: `Polizeibericht per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} angefordert`,
    beschreibung: `Dispatcher hat Anfrage für die polizeiliche Unfallmitteilung gesendet. Kunde antwortet mit Foto.`,
    erstellt_von: auth.user.id,
  }).then(() => {}, () => {})

  return { success: true }
}
