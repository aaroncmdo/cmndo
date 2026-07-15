// Dünner Cold-Mail-Transport auf dem bestehenden Resend-Singleton.
// Bewusst getrennt vom transaktionalen sendEmail (google/client.ts): eigener Absender,
// List-Unsubscribe-Header, Webhook-tags, Logging in cold_mail_sends statt email_log.
import { resend } from '@/lib/email/resend-client'

export type SendColdMailResult = { ok: true; messageId: string | null } | { ok: false; error: string }

/**
 * Absender der Cold-Mails.
 *
 * Default = claimondo.de (Aaron-Entscheid 14.07.), weil das die EINZIGE bei Resend
 * verifizierte Domain ist: 'mail.claimondo.de' existiert im DNS gar nicht (kein TXT/
 * DKIM/MX — geprüft), ein Send von dort scheitert an "domain not verified".
 *
 * ⚠️ TRADE-OFF, bewusst eingegangen: claimondo.de verschickt auch die transaktionalen
 * Mails (Passwort-Reset, 2FA, Fall-Updates). Spam-Beschwerden und Bounces aus dem
 * Cold-Outreach schlagen damit auf DEREN Reputation durch. Die Spec wollte das per
 * Subdomain isolieren.
 *
 * → Sobald 'mail.claimondo.de' bei Resend angelegt + per SPF/DKIM/DMARC verifiziert ist:
 *   COLD_MAIL_FROM_DOMAIN=mail.claimondo.de setzen. Kein Code-Change nötig, die
 *   Isolation ist dann sofort wieder da.
 */
export function coldMailFromAddress(): string {
  const domain = process.env.COLD_MAIL_FROM_DOMAIN || 'claimondo.de'
  return `Claimondo Partnernetzwerk <partner@${domain}>`
}

/**
 * Reply-To. Der Absender ist partner@<domain>, aber dahinter liegt kein Postfach —
 * antwortet ein angeschriebener Betrieb direkt auf die Mail, liefe die Antwort ins
 * Leere. Reply-To lenkt sie auf ein ueberwachtes Postfach (Default info@claimondo.de,
 * per COLD_MAIL_REPLY_TO ueberschreibbar).
 */
export function coldMailReplyTo(): string {
  return process.env.COLD_MAIL_REPLY_TO || 'info@claimondo.de'
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
      replyTo: coldMailReplyTo(),
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
