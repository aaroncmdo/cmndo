import { render } from '@react-email/render'
import { resend, isResendAvailable } from './resend-client'
import { htmlToPlainText } from './plain-text'
import { createAdminClient } from '@/lib/supabase/admin'
import LeadReminder1 from './google/templates/LeadReminder1'
import LeadReminder2 from './google/templates/LeadReminder2'
import LeadReminder3 from './google/templates/LeadReminder3'
import LeadReminder4 from './google/templates/LeadReminder4'

// AAR-477 C11: Versender für die Reminder-Templates. Zentralisiert Subject,
// Absender, Template-Wahl — damit die Cron-Route nur noch
// sendLeadReminderEmail(lead, 1|2|3|4) aufruft.
//
// Fail-Soft: Wenn RESEND_API_KEY fehlt (Dev ohne Env), loggt wir und geben
// false zurück. Der Cron zählt dann nicht als „gesendet" und setzt
// reminder_N_sent_at auch nicht — so kriegt der User die Mail später
// nach, wenn die Env gesetzt ist.

type ReminderStep = 1 | 2 | 3 | 4

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
  4: 'Wirklich letzte Erinnerung — Ihre Schadenmeldung schließt bald',
}

const FROM = 'Claimondo <noreply@claimondo.de>'

function resumeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    'https://claimondo.de'
  return `${base.replace(/\/$/, '')}/schaden-melden/fortsetzen/${token}`
}

// Nachvollziehbarkeit (17.07.2026): Jeder ECHTE Versand-Versuch landet in email_log
// (lead_id-verknuepft) — vorher war die Nurture-Schiene dort unsichtbar (Befund
// Benachrichtigungs-Matrix-Audit, PR #4490). Kein Log fuer Vorbedingungs-Aborts
// (fehlender RESEND_API_KEY / fehlende Email): das sind keine Versand-Versuche,
// der Cron holt sie im naechsten Tick nach. Non-critical: Log-Fehler duerfen den
// Send-Erfolg nicht kippen.
async function logReminderSend(
  lead: ReminderLead,
  step: ReminderStep,
  status: 'sent' | 'failed',
  extra?: { messageId?: string | null; fehler?: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('email_log').insert({
      lead_id: lead.id,
      empfaenger: lead.email,
      empfaenger_typ: 'kunde',
      template: `lead_reminder_${step}`,
      subject: SUBJECTS[step],
      status,
      provider: 'resend',
      message_id: extra?.messageId ?? null,
      fehler: extra?.fehler ?? null,
      versuche: 1,
      gesendet_am: status === 'sent' ? new Date().toISOString() : null,
    })
  } catch (logErr) {
    console.error(
      '[AAR-477] email_log-Insert fehlgeschlagen (non-critical):',
      logErr instanceof Error ? logErr.message : logErr,
    )
  }
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
    step === 1 ? LeadReminder1 : step === 2 ? LeadReminder2 : step === 3 ? LeadReminder3 : LeadReminder4

  try {
    const html = await render(Component({ vorname: lead.vorname, resumeUrl: url }))
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: lead.email,
      subject: SUBJECTS[step],
      html,
      text: htmlToPlainText(html),
    })
    if (error) {
      console.error('[AAR-477] Resend-Fehler bei Reminder', step, 'Lead', lead.id, error)
      await logReminderSend(lead, step, 'failed', { fehler: error.message ?? String(error) })
      return false
    }
    await logReminderSend(lead, step, 'sent', { messageId: data?.id ?? null })
    return true
  } catch (err) {
    console.error('[AAR-477] Versand-Exception bei Reminder', step, 'Lead', lead.id, err)
    await logReminderSend(lead, step, 'failed', {
      fehler: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
