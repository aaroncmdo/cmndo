'use server'

// AAR-352: Multi-Slot-Dokument-Upload-Anfrage — ersetzt die Einzel-Karten-
// Actions triggerZb1UploadRequest + triggerPolizeiberichtUploadRequest durch
// eine einzige Anfrage, die mehrere Slots in einem Link bündelt.
//
// Für den Slot 'fahrzeugschein' wird zusätzlich leads.zb1_status/zb1_token
// gespiegelt, damit der Twilio-WhatsApp-Inbound-Webhook (der auf zb1_status
// = 'gesendet' lauscht) weiter funktioniert, wenn der Kunde direkt per WA
// antwortet statt den Link zu nutzen.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Kanal = 'whatsapp' | 'sms' | 'email'

export type SlotEingabe = {
  // AAR-unfallfotos: „unfallfotos" als Multi-File-Slot ergänzt. Kunde darf
  // beliebig viele Fotos hochladen; nach dem ersten Upload wird der Slot als
  // „hochgeladen" markiert, aber weitere Uploads werden akzeptiert und in
  // leads.schadensfoto_urls angehängt. Haiku-Vision wertet die Fotos aus und
  // befüllt leads.fahrzeugschaden_beschreibung (separate Spalte seit
  // AAR-665-Follow — sachschaden_beschreibung ist Drittschaden in Phase 1).
  slot_id:
    | 'fahrzeugschein'
    | 'polizeibericht'
    | 'unfallfotos'
    | 'sonstiges'
    | 'sachschaden_foto'
    | 'sachschaden_rechnung'
    | 'aerztliches_attest'
    | 'diagnosebericht'
    | 'zeugenaussage'
  ocr?: boolean
  label?: string  // optional — überschreibt Default-Label (nur für 'sonstiges' relevant)
}

type Result = { success: boolean; error?: string; token?: string }

const DEFAULT_LABELS: Record<SlotEingabe['slot_id'], string> = {
  fahrzeugschein: 'Fahrzeugschein (Vorderseite)',
  polizeibericht: 'Polizeiliche Unfallmitteilung',
  unfallfotos: 'Unfallfotos (alle Schaden-Ansichten)',
  sonstiges: 'Sonstiges Dokument',
  sachschaden_foto: 'Fotos des Sachschadens',
  sachschaden_rechnung: 'Rechnung / Kostenvoranschlag Sachschaden',
  aerztliches_attest: 'Ärztliches Attest',
  diagnosebericht: 'Diagnosebericht / Befundbericht',
  zeugenaussage: 'Zeugenaussage / Zeugenkontakt',
}

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
    return { error: 'Nur Dispatch/KB/Admin darf Dokumente anfordern' as const }
  }
  return { user, rolle }
}

export async function triggerDokumenteUploadRequest(
  leadId: string,
  slots: SlotEingabe[],
  kanal: Kanal,
): Promise<Result> {
  const supabase = await createClient()
  const auth = await requireDispatcher(supabase)
  if ('error' in auth) return { success: false, error: auth.error }

  if (!Array.isArray(slots) || slots.length === 0) {
    return { success: false, error: 'Mindestens ein Dokument auswählen' }
  }

  const db = createAdminClient()
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, nachname, telefon, email')
    .eq('id', leadId)
    .single()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  if ((kanal === 'whatsapp' || kanal === 'sms') && !lead.telefon) {
    return { success: false, error: 'Keine Telefonnummer am Lead' }
  }
  if (kanal === 'email' && !lead.email) {
    return { success: false, error: 'Keine Email-Adresse am Lead' }
  }

  const { randomBytes } = await import('crypto')
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Slot-Normalisierung — OCR nur für fahrzeugschein sinnvoll, bei anderen ignoriert
  const normalizedSlots = slots.map((s) => ({
    slot_id: s.slot_id,
    label: s.label?.trim() || DEFAULT_LABELS[s.slot_id],
    ocr: s.slot_id === 'fahrzeugschein' ? s.ocr !== false : false,
    hochgeladen: false,
    doc_url: null as string | null,
    hochgeladen_am: null as string | null,
  }))

  const { error: insErr } = await db
    .from('dokument_upload_anfragen')
    .insert({
      lead_id: leadId,
      token,
      slots: normalizedSlots,
      kanal,
      status: 'gesendet',
      expires_at: expiresAt,
      erstellt_von: auth.user.id,
    })
  if (insErr) return { success: false, error: insErr.message }

  const now = new Date().toISOString()

  // Legacy-Felder für Twilio-Inbound-Webhook-Kompatibilität spiegeln.
  // Kunde kann weiterhin per WA-Antwort mit Foto reagieren — Webhook findet
  // den Lead via Telefonnummer + offenem zb1_status/polizeibericht_status.
  const legacyUpdate: Record<string, unknown> = { updated_at: now }
  if (normalizedSlots.some((s) => s.slot_id === 'fahrzeugschein' && s.ocr)) {
    legacyUpdate.zb1_token = token
    legacyUpdate.zb1_token_expires_at = expiresAt
    legacyUpdate.zb1_status = 'gesendet'
    legacyUpdate.zb1_gesendet_am = now
  }
  if (normalizedSlots.some((s) => s.slot_id === 'polizeibericht')) {
    legacyUpdate.polizeibericht_token = token
    legacyUpdate.polizeibericht_status = 'gesendet'
    legacyUpdate.polizeibericht_gesendet_am = now
  }
  // AAR-unfallfotos: kein eigener Status-Spiegel auf `leads` — der Status
  // läuft komplett über `dokument_upload_anfragen.status` + das jsonb-Array
  // leads.schadensfoto_urls (Fotos = vorhanden). Spart eine Migration.
  if (Object.keys(legacyUpdate).length > 1) {
    await db.from('leads').update(legacyUpdate).eq('id', leadId)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const uploadUrl = `${baseUrl}/upload/dokumente/${token}`
  const dokumenteListe = normalizedSlots.map((s) => `- ${s.label}`).join('\n')

  // Versand — non-critical: Anfrage steht auch wenn Versand fehlschlägt,
  // MA kann den Link dann manuell per copy/paste weitergeben.
  try {
    if (kanal === 'whatsapp') {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('dokumente_upload_anfrage', {
        telefon: lead.telefon!,
        '1': lead.vorname ?? '',
        '2': uploadUrl,
      })
    } else if (kanal === 'sms') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const smsFrom = process.env.TWILIO_SMS_FROM
      if (!accountSid || !authToken || !smsFrom) {
        return { success: false, error: 'Twilio-SMS-Credentials fehlen' }
      }
      let normalTo = lead.telefon!.replace(/\s/g, '')
      if (normalTo.startsWith('0')) normalTo = '+49' + normalTo.slice(1)
      else if (!normalTo.startsWith('+')) normalTo = '+' + normalTo
      const body = `Hallo ${lead.vorname ?? ''}, bitte laden Sie folgende Dokumente hoch:\n${dokumenteListe}\n\n${uploadUrl}\n\n(Link gültig 7 Tage.) Claimondo`
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
      const { render } = await import('@react-email/render')
      const { DokumenteAnfrageEmail, subject: dokSubject } = await import('@/lib/email/google/templates/DokumenteAnfrage')
      const vorname = lead.vorname ?? ''
      const templateProps = { vorname, slots: normalizedSlots, uploadUrl }
      const html = await render(DokumenteAnfrageEmail(templateProps))
      await sendEmail({
        to: lead.email!,
        subject: dokSubject(templateProps),
        text: `Hallo ${vorname},\n\nbitte laden Sie folgende Dokumente hoch:\n${dokumenteListe}\n\n${uploadUrl}\n\n(Link ist 7 Tage gültig.)\n\nMit freundlichen Grüßen,\nIhr Claimondo-Team`,
        html,
      })
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Versand fehlgeschlagen',
    }
  }

  // Timeline-Eintrag
  const kanalLabel = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
  const slotLabels = normalizedSlots.map((s) => s.label).join(', ')
  await db.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: `Dokumente per ${kanalLabel} angefordert`,
    beschreibung: `Dispatcher hat Upload-Link für: ${slotLabels}`,
    erstellt_von: auth.user.id,
  }).then(() => {}, () => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, token }
}
