import { render } from '@react-email/render'
import { resend, isResendAvailable } from './resend-client'
import { htmlToPlainText } from './plain-text'
import LeadWinback from './google/templates/LeadWinback'
import { winbackResumeUrl, winbackOptOutUrl, type WinbackCandidate } from '@/lib/leads/winback'

// Versender für die einmalige Win-back-Reaktivierungs-Mail. Analog zu
// lead-reminders.ts (Fail-Soft: kein RESEND_API_KEY -> false, Caller markiert
// dann NICHT als gesendet und der Lead bleibt für einen späteren Lauf drin).
//
// Pflicht (UWG): List-Unsubscribe-Header (One-Click-Abmeldung) zusätzlich zum
// sichtbaren Abmelde-Link im Template.

const FROM = 'Claimondo <noreply@claimondo.de>'
const SUBJECT = 'Ihre Schadenmeldung wartet noch auf Sie'

export async function sendLeadWinbackEmail(lead: WinbackCandidate): Promise<boolean> {
  if (!isResendAvailable() || !resend) {
    console.warn('[winback] RESEND_API_KEY fehlt — nicht gesendet für Lead', lead.id)
    return false
  }
  if (!lead.email) {
    console.warn('[winback] Lead ohne Email — übersprungen:', lead.id)
    return false
  }

  const resumeUrl = winbackResumeUrl(lead.reminder_token)
  const optOutUrl = winbackOptOutUrl(lead.reminder_token)

  try {
    const html = await render(LeadWinback({ vorname: lead.vorname, resumeUrl, optOutUrl }))
    const { error } = await resend.emails.send({
      from: FROM,
      to: lead.email,
      subject: SUBJECT,
      html,
      text: htmlToPlainText(html),
      // List-Unsubscribe (GET-URL) — vom sichtbaren Abmelde-Link im Template
      // gedeckt; die /abmelden/[token]-Seite setzt winback_opt_out idempotent.
      headers: {
        'List-Unsubscribe': `<${optOutUrl}>`,
      },
    })
    if (error) {
      console.error('[winback] Resend-Fehler Lead', lead.id, error)
      return false
    }
    return true
  } catch (err) {
    console.error('[winback] Versand-Exception Lead', lead.id, err)
    return false
  }
}
