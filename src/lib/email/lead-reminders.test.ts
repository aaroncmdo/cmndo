import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Guards fuer den Reminder-Sender: Stufe 4 + email_log-Nachvollziehbarkeit (17.07.2026).
// Vorher loggte der Reminder-Pfad in KEINE Tabelle (Befund Benachrichtigungs-Matrix-Audit,
// PR #4490) — email_log kannte nur task_reminder_aar430, die Nurture-Sends waren unsichtbar.
const src = () => readFileSync('src/lib/email/lead-reminders.ts', 'utf8')

describe('sendLeadReminderEmail — Stufe 4 + email_log', () => {
  it('kennt alle 4 Stufen (Template-Import + Subject-Eintrag)', () => {
    expect(src()).toContain('LeadReminder4')
    expect(src()).toMatch(/4:\s*'/)
  })

  it('loggt jeden Versand-Versuch in email_log (lead_id-verknuepft, empfaenger_typ kunde, provider resend)', () => {
    expect(src()).toContain(".from('email_log')")
    expect(src()).toContain('lead_reminder_')
    expect(src()).toContain("empfaenger_typ: 'kunde'")
    expect(src()).toContain("provider: 'resend'")
  })

  it('baut die Resume-URL weiter auf /schaden-melden/fortsetzen/ (Link-Format = Kontrakt mit der Route)', () => {
    expect(src()).toContain('/schaden-melden/fortsetzen/')
  })
})
