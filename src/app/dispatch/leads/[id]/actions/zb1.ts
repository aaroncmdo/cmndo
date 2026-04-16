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
    .select('id, vorname, nachname, telefon, email, zb1_token, zb1_token_expires_at, zb1_status')
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

  // AAR-296: Token-Lifecycle — wiederverwenden wenn noch gültig + nicht
  // schon hochgeladen, sonst neu generieren. Expiry 7 Tage.
  const { randomBytes } = await import('crypto')
  const expired =
    !lead.zb1_token_expires_at ||
    new Date(lead.zb1_token_expires_at).getTime() < Date.now()
  const reuseToken =
    lead.zb1_token && !expired && lead.zb1_status !== 'hochgeladen'
  const token = reuseToken ? lead.zb1_token : randomBytes(24).toString('hex')
  const expiresAt = reuseToken
    ? lead.zb1_token_expires_at
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const now = new Date().toISOString()
  const { error: updErr } = await db
    .from('leads')
    .update({
      zb1_token: token,
      zb1_token_expires_at: expiresAt,
      zb1_status: 'gesendet',
      zb1_gesendet_am: now,
      updated_at: now,
    })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  // AAR-296: Upload-Link für Web-Page (primärer Weg, Twilio bleibt Fallback)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const uploadUrl = `${baseUrl}/upload/zb1/${token}`

  // Versand (non-critical für den Status — wenn das Template fehlt oder
  // Twilio down ist, soll der Dispatcher nicht komplett blockiert werden).
  // AAR-296: Web-Upload-Link wird in SMS/Email mitgeschickt (primärer Weg).
  // WhatsApp-Template muss den Link als zweite Variable haben — bis das
  // Template upgraded ist, bleibt der WA-Inbound-Webhook der Fallback.
  try {
    if (kanal === 'whatsapp') {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('zb1_upload_anfrage', {
        telefon: telefon!,
        '1': lead.vorname ?? '',
        // AAR-296: zweite Variable für Upload-Link — Template muss {{2}}
        // enthalten. Falls Template nur {{1}} hat, wird {{2}} ignoriert
        // (Twilio Content API ist tolerant).
        '2': uploadUrl,
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
      // AAR-296: SMS enthält direkten Upload-Link statt nur Aufforderung zur Antwort.
      const body = `Hallo ${lead.vorname ?? ''}, bitte fotografieren Sie Ihren Fahrzeugschein (Vorderseite) und laden ihn hier hoch: ${uploadUrl} (Link gültig 7 Tage). Claimondo.`
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
      // AAR-296: Email enthält jetzt einen Web-Upload-Link statt „antworten Sie".
      const { sendEmail } = await import('@/lib/email/google/client')
      const text = `Hallo ${lead.vorname ?? ''},\n\nbitte fotografieren Sie Ihren Fahrzeugschein (Vorderseite) und laden ihn über folgenden Link hoch:\n\n${uploadUrl}\n\n(Link ist 7 Tage gültig.)\n\nWir lesen die Daten automatisch aus und setzen Ihren Fall fort.\n\nDanke!\nClaimondo`
      await sendEmail({
        to: lead.email!,
        subject: 'Foto Ihres Fahrzeugscheins — Claimondo',
        text,
        html: `<p>Hallo ${lead.vorname ?? ''},</p><p>bitte fotografieren Sie Ihren Fahrzeugschein (Vorderseite) und laden ihn über den folgenden Link hoch:</p><p><a href="${uploadUrl}" style="display:inline-block;background:#0D1B3E;color:#fff;padding:10px 20px;text-decoration:none;border-radius:8px;">Fahrzeugschein hochladen</a></p><p style="font-size:12px;color:#666;">Link ist 7 Tage gültig.</p><p>Danke!<br/>Claimondo</p>`,
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
