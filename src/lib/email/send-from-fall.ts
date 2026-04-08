'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

type Empfaenger = { typ: 'kunde' | 'sv' | 'kanzlei' | 'custom'; email: string; name?: string }

/**
 * KFZ-147: Email aus der Fallakte senden.
 */
export async function sendEmailFromFall({
  fallId,
  empfaenger,
  cc,
  bcc,
  subject,
  bodyHtml,
  bodyText,
}: {
  fallId: string
  empfaenger: Empfaenger[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyHtml: string
  bodyText?: string
}): Promise<{ emailLogId: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const db = createAdminClient()
  const { data: fall } = await db.from('faelle').select('fall_nummer').eq('id', fallId).single()
  if (!fall) throw new Error('Fall nicht gefunden')

  const toAddresses = empfaenger.map(e => e.email).filter(Boolean)
  if (toAddresses.length === 0) throw new Error('Kein Empfänger angegeben')

  // Fall-Nummer im Subject sicherstellen
  const finalSubject = subject.includes(`[Fall`) ? subject : `[Fall #${fall.fall_nummer ?? fallId.slice(0, 8)}] ${subject}`

  // Reply-To auf Plus-Alias setzen
  const replyTo = `replies+${fallId}@claimondo.de`

  // Branding-Wrapper
  const brandedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Montserrat',-apple-system,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:32px 16px">
<div style="background:#0D1B3E;border-radius:16px 16px 0 0;padding:20px 32px">
<span style="color:#fff;font-size:20px;font-weight:700">Claimondo</span>
</div>
<div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:0">
${bodyHtml}
</div>
<div style="background:#f9fafb;border-radius:0 0 16px 16px;padding:16px 32px;border:1px solid #e5e7eb;border-top:0">
<p style="color:#9ca3af;font-size:11px;margin:0;text-align:center">Claimondo GmbH — Fall #${fall.fall_nummer ?? fallId.slice(0, 8)}</p>
</div>
</div></body></html>`

  const result = await sendEmail({
    to: toAddresses,
    subject: finalSubject,
    html: brandedHtml,
    text: bodyText,
    replyTo,
    fallId,
    empfaengerTyp: empfaenger[0]?.typ === 'custom' ? 'admin' : empfaenger[0]?.typ ?? 'admin',
    template: 'fall_compose',
  })

  // email_log Update mit erweiterten Feldern
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
      cc: cc ?? null,
      bcc: bcc ?? null,
      gesendet_von_user_id: user.id,
      in_reply_to: null,
      thread_id: fallId,
    }).eq('id', logEntry.id)

    return { emailLogId: logEntry.id }
  }

  return { emailLogId: result.messageId }
}
