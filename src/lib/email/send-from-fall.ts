'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'
import { revalidatePath } from 'next/cache'

type Empfaenger = { typ: 'kunde' | 'sv' | 'kanzlei' | 'custom'; email: string; name?: string }

/**
 * KFZ-147 A.2: Email aus der Fallakte senden.
 * Rendert mit Branding-Wrapper, speichert in email_log mit allen Feldern,
 * setzt reply-to auf Plus-Alias für automatisches Inbound-Tracking.
 */
export async function sendEmailFromFall({
  fallId,
  empfaenger,
  cc,
  bcc,
  subject,
  bodyHtml,
  bodyText,
  attachmentPaths,
  templateId,
}: {
  fallId: string
  empfaenger: Empfaenger[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyHtml: string
  bodyText?: string
  attachmentPaths?: string[]
  templateId?: string
}): Promise<{ emailLogId: string }> {
  // Auth
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Berechtigung prüfen
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) throw new Error('Kein Zugriff')

  const db = createAdminClient()
  const { data: fall } = await db.from('faelle').select('fall_nummer, lead_id').eq('id', fallId).single()
  if (!fall) throw new Error('Fall nicht gefunden')

  const toAddresses = empfaenger.map(e => e.email).filter(Boolean)
  if (toAddresses.length === 0) throw new Error('Kein Empfänger angegeben')
  if (!subject.trim()) throw new Error('Betreff fehlt')

  // Fall-Nummer im Subject
  const fallNr = fall.fall_nummer ?? fallId.slice(0, 8)
  const finalSubject = subject.includes('[Fall') ? subject : `[Fall #${fallNr}] ${subject}`

  // Reply-To Plus-Alias für Inbound-Tracking
  const replyTo = `replies+${fallId}@claimondo.de`

  // Branding-Wrapper
  const brandedHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">
<div style="background:#0D1B3E;border-radius:16px 16px 0 0;padding:20px 32px">
<span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Claimondo</span>
</div>
<div style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
${bodyHtml}
</div>
<div style="background:#f9fafb;border-radius:0 0 16px 16px;padding:16px 32px;border:1px solid #e5e7eb;border-top:0">
<p style="color:#9ca3af;font-size:11px;margin:0;text-align:center">Claimondo GmbH &middot; Fall #${fallNr}</p>
<p style="color:#9ca3af;font-size:10px;margin:4px 0 0;text-align:center">Diese E-Mail wurde über das Claimondo-Portal versendet. Antworten Sie direkt auf diese E-Mail.</p>
</div>
</div></body></html>`

  // Attachments aus Storage laden
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  if (attachmentPaths?.length) {
    for (const path of attachmentPaths) {
      try {
        const { data } = await db.storage.from('dokumente').download(path)
        if (data) {
          const buf = Buffer.from(await data.arrayBuffer())
          const filename = path.split('/').pop() ?? 'Anhang'
          attachments.push({ filename, content: buf, contentType: data.type || 'application/octet-stream' })
        }
      } catch (err) { console.error(`[KFZ-147] Anhang-Download fehlgeschlagen: ${path}`, err) }
    }
  }

  // Senden via KFZ-137 Email-Modul
  const result = await sendEmail({
    to: toAddresses,
    subject: finalSubject,
    html: brandedHtml,
    text: bodyText,
    replyTo,
    attachments: attachments.length > 0 ? attachments : undefined,
    fallId,
    empfaengerTyp: empfaenger[0]?.typ === 'custom' ? 'admin' : empfaenger[0]?.typ ?? 'admin',
    template: templateId ?? 'fall_compose',
  })

  // email_log um erweiterte Felder ergänzen
  const { data: logEntry } = await db.from('email_log')
    .select('id')
    .eq('message_id', result.messageId)
    .limit(1)
    .maybeSingle()

  if (logEntry) {
    await db.from('email_log').update({
      richtung: 'outbound',
      body_html: bodyHtml,
      body_text: bodyText ?? null,
      empfaenger_array: empfaenger,
      cc: cc?.length ? cc : null,
      bcc: bcc?.length ? bcc : null,
      gesendet_von_user_id: user.id,
      thread_id: fallId,
      lead_id: fall.lead_id ?? null,
    }).eq('id', logEntry.id)
  }

  revalidatePath(`/admin/faelle/${fallId}`)
  return { emailLogId: logEntry?.id ?? result.messageId }
}

/**
 * KFZ-147: Template-Kontext aus Fall laden.
 */
export async function getTemplateContext(fallId: string) {
  const db = createAdminClient()
  const { data: fall } = await db.from('faelle').select(
    'fall_nummer, lead_id, sv_id, sv_termin, besichtigungsort_adresse, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, gegner_versicherung, versicherung_name'
  ).eq('id', fallId).single()
  if (!fall) return null

  let kundeName = '—'
  let kundeVorname = '—'
  if (fall.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
    if (lead) {
      kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      kundeVorname = lead.vorname || '—'
    }
  }

  let svName = '—'
  if (fall.sv_id) {
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    if (sv?.profile_id) {
      const { data: p } = await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
    }
  }

  const terminDate = fall.sv_termin ? new Date(fall.sv_termin) : null

  return {
    fall_nr: fall.fall_nummer ?? fallId.slice(0, 8),
    kunde_name: kundeName,
    kunde_vorname: kundeVorname,
    sv_name: svName,
    termin_datum: terminDate ? terminDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—',
    termin_uhrzeit: terminDate ? terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—',
    termin_adresse: fall.besichtigungsort_adresse ?? '—',
    fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || fall.kennzeichen || '—',
    versicherung: fall.gegner_versicherung ?? fall.versicherung_name ?? '—',
  }
}
