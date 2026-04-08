import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'

// Google Workspace Limit: 2000 Mails/Tag pro User
const transporter = nodemailer.createTransport({
  host: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.GMAIL_SMTP_PORT || '587'),
  secure: false, // STARTTLS auf Port 587
  auth: {
    user: process.env.GMAIL_SMTP_USER || '',
    pass: process.env.GMAIL_SMTP_PASS || '', // App-Passwort, NICHT normales Passwort
  },
})

type SendEmailOpts = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>
  replyTo?: string
  fallId?: string | null
  empfaengerTyp?: 'kunde' | 'sv' | 'kanzlei' | 'admin'
  template?: string
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ messageId: string }> {
  const from = process.env.GMAIL_SMTP_FROM || 'Claimondo <noreply@claimondo.de>'
  const admin = createAdminClient()
  const toAddr = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to

  if (!toAddr) {
    // Log failed
    await admin.from('email_log').insert({
      fall_id: opts.fallId ?? null,
      empfaenger: '',
      empfaenger_typ: opts.empfaengerTyp ?? 'admin',
      template: opts.template ?? 'unknown',
      subject: opts.subject,
      status: 'failed',
      fehler: 'Keine Email-Adresse',
      versuche: 1,
    })
    throw new Error('Keine Email-Adresse')
  }

  // Insert pending log
  const { data: logEntry } = await admin.from('email_log').insert({
    fall_id: opts.fallId ?? null,
    empfaenger: toAddr,
    empfaenger_typ: opts.empfaengerTyp ?? 'admin',
    template: opts.template ?? 'unknown',
    subject: opts.subject,
    status: 'pending',
    versuche: 0,
    attachments: opts.attachments ? opts.attachments.map(a => ({ filename: a.filename, contentType: a.contentType })) : null,
  }).select('id').single()

  const logId = logEntry?.id

  // Retry-Logik: 3 Versuche bei Fehler, exponential backoff
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await transporter.sendMail({
        from,
        to: toAddr,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        attachments: opts.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })

      // Log success
      if (logId) {
        await admin.from('email_log').update({
          status: 'sent',
          message_id: result.messageId,
          versuche: attempt,
          gesendet_am: new Date().toISOString(),
        }).eq('id', logId)
      }

      return { messageId: result.messageId }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (logId) {
        await admin.from('email_log').update({
          versuche: attempt,
          fehler: lastError.message,
        }).eq('id', logId)
      }

      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
  }

  // Final failure
  if (logId) {
    await admin.from('email_log').update({
      status: 'failed',
      fehler: lastError?.message ?? 'Unbekannter Fehler',
    }).eq('id', logId)
  }

  throw lastError ?? new Error('Email-Versand fehlgeschlagen')
}
