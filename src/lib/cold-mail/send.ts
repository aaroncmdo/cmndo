// Dünner Cold-Mail-Transport auf dem bestehenden Resend-Singleton.
// Bewusst getrennt vom transaktionalen sendEmail (google/client.ts): eigene Sende-(Sub)domain
// zur Reputations-Isolation, List-Unsubscribe-Header, Webhook-tags, Logging in cold_mail_sends
// statt email_log.
import { resend } from '@/lib/email/resend-client'

export type SendColdMailResult = { ok: true; messageId: string | null } | { ok: false; error: string }

export function coldMailFromAddress(): string {
  const domain = process.env.COLD_MAIL_FROM_DOMAIN || 'mail.claimondo.de'
  return `Claimondo Partnernetzwerk <partner@${domain}>`
}

export async function sendColdMail(opts: {
  to: string
  subject: string
  html: string
  abmeldeUrl: string
  leadId: string
}): Promise<SendColdMailResult> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY ist nicht konfiguriert.' }
  try {
    const res = await resend.emails.send({
      from: coldMailFromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: {
        'List-Unsubscribe': `<${opts.abmeldeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'typ', value: 'cold_mail' },
        { name: 'lead', value: opts.leadId },
      ],
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, messageId: res.data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Resend-Send fehlgeschlagen.' }
  }
}
