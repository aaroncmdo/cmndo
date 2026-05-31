import { resend, isResendAvailable } from './resend-client'
import LeadReminder1 from './google/templates/LeadReminder1'
import LeadReminder2 from './google/templates/LeadReminder2'
import LeadReminder3 from './google/templates/LeadReminder3'

// AAR-477 C11: Versender für die 3 Reminder-Templates. Zentralisiert Subject,
// Absender, Template-Wahl — damit die Cron-Route nur noch
// sendLeadReminderEmail(lead, 1|2|3) aufruft.
//
// Fail-Soft: Wenn RESEND_API_KEY fehlt (Dev ohne Env), loggt wir und geben
// false zurück. Der Cron zählt dann nicht als „gesendet" und setzt
// reminder_N_sent_at auch nicht — so kriegt der User die Mail später
// nach, wenn die Env gesetzt ist.

type ReminderStep = 1 | 2 | 3

type ReminderLead = {
  id: string
  email: string
  vorname: string | null
  reminder_token: string
}

const SUBJECTS: Record<ReminderStep, string> = {
  1: 'Ihre Schadenmeldung ist fast fertig',
  2: 'Sollen wir Ihren Schadenfall noch bearbeiten?',
  3: 'Letzte Chance: Ihre Schadenmeldung läuft ab',
}

const FROM = 'Claimondo <noreply@claimondo.de>'

function resumeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    'https://claimondo.de'
  return `${base.replace(/\/$/, '')}/schaden-melden/fortsetzen/${token}`
}

export async function sendLeadReminderEmail(
  lead: ReminderLead,
  step: ReminderStep,
): Promise<boolean> {
  if (!isResendAvailable() || !resend) {
    console.warn('[AAR-477] RESEND_API_KEY fehlt — Reminder', step, 'nicht gesendet für Lead', lead.id)
    return false
  }
  if (!lead.email) {
    console.warn('[AAR-477] Lead ohne Email — Reminder', step, 'übersprungen:', lead.id)
    return false
  }

  const url = resumeUrl(lead.reminder_token)
  const Component =
    step === 1 ? LeadReminder1 : step === 2 ? LeadReminder2 : LeadReminder3

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: lead.email,
      subject: SUBJECTS[step],
      react: Component({ vorname: lead.vorname, resumeUrl: url }),
    })
    if (error) {
      console.error('[AAR-477] Resend-Fehler bei Reminder', step, 'Lead', lead.id, error)
      return false
    }
    return true
  } catch (err) {
    console.error('[AAR-477] Versand-Exception bei Reminder', step, 'Lead', lead.id, err)
    return false
  }
}
