'use server'

// AAR-182: Dispatcher triggert ZB1-Upload-Anfrage beim Kunden (WA/SMS/Email).
// Generiert einen zb1_token, setzt zb1_status='gesendet', verschickt das
// Template `zb1_upload_anfrage` (WA) bzw. SMS/Email-Fallback.
// Der Kunde antwortet mit Foto direkt per WhatsApp — der Twilio-Inbound-
// Webhook erkennt das Media anhand der Telefonnummer + offenem zb1_status
// und löst Storage-Upload + OCR aus.

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
    return { error: 'Nur Dispatch/KB/Admin darf ZB1 anfordern' as const }
  }
  return { user, rolle }
}

export async function triggerZb1UploadRequest(
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
    .select('id, vorname, nachname, telefon, email, zb1_token')
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

  // Token erzeugen (oder vorhandenen wiederverwenden) — der Kunde erhält
  // keinen Link sondern antwortet direkt per WA. Token ist nur für Tracking
  // + ggf. spätere Portal-Upload-Route.
  const { randomBytes } = await import('crypto')
  const token = lead.zb1_token ?? randomBytes(24).toString('hex')

  const now = new Date().toISOString()
  const { error: updErr } = await db
    .from('leads')
    .update({
      zb1_token: token,
      zb1_status: 'gesendet',
      zb1_gesendet_am: now,
      updated_at: now,
    })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  // Versand (non-critical für den Status — wenn das Template fehlt oder
  // Twilio down ist, soll der Dispatcher nicht komplett blockiert werden).
  try {
    if (kanal === 'whatsapp') {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('zb1_upload_anfrage', {
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
      const body = `Hallo ${lead.vorname ?? ''}, bitte schicken Sie uns ein Foto Ihres Fahrzeugscheins (Vorderseite) als Antwort auf diese Nachricht. Claimondo.`
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
      // Minimal: Nutze sendEmail mit einem einfachen Text-Body. Eigenes
      // Template kann später über /lib/email/google/templates nachgereicht werden.
      const { sendEmail } = await import('@/lib/email/google/client')
      const text = `Hallo ${lead.vorname ?? ''},\n\nBitte antworten Sie kurz auf diese Mail mit einem Foto Ihres Fahrzeugscheins (Vorderseite). Wir lesen die Daten automatisch aus und setzen Ihren Fall fort.\n\nDanke!\nClaimondo`
      await sendEmail({
        to: lead.email!,
        subject: 'Foto Ihres Fahrzeugscheins — Claimondo',
        text,
        html: `<p>Hallo ${lead.vorname ?? ''},</p><p>Bitte antworten Sie kurz auf diese Mail mit einem Foto Ihres Fahrzeugscheins (Vorderseite). Wir lesen die Daten automatisch aus und setzen Ihren Fall fort.</p><p>Danke!<br/>Claimondo</p>`,
      })
    }
  } catch (err) {
    // Status bleibt auf 'gesendet' — MA kann manuell nachziehen. Error
    // trotzdem zurückgeben damit UI eine klare Meldung zeigt.
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Versand fehlgeschlagen',
    }
  }

  // Timeline-Eintrag
  await db.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: `ZB1-Foto per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} angefordert`,
    beschreibung: `Dispatcher hat Fahrzeugschein-Upload-Anfrage gesendet. Kunde antwortet mit Foto.`,
    erstellt_von: auth.user.id,
  }).then(() => {}, () => {})

  return { success: true }
}
