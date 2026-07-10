import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Regression-Guard: Nurture/Timeout-Asymmetrie-Fix (#3489) + 4. Reminder (Follow-up 1).
describe('send-lead-reminders — Nurture/Timeout + 4. Reminder', () => {
  const src = readFileSync('src/app/api/cron/send-lead-reminders/route.ts', 'utf8')
  it('nurtured NICHT nur self_service (Asymmetrie gefixt)', () => {
    expect(src).not.toContain(".eq('source_channel', 'self_service')")
  })
  it('schliesst von der Nurture nur makler/manuell aus', () => {
    expect(src).toContain(".not('source_channel', 'in', '(makler-anfrage,manuell)')")
  })
  it('der Timeout bleibt intakt (mark_expired_leads)', () => {
    expect(src).toContain('mark_expired_leads')
  })
  it('hat eine 4. Reminder-Kohorte (reminder_4_sent_at + cohort4)', () => {
    expect(src).toContain('reminder_4_sent_at')
    expect(src).toContain('cohort4')
  })
})
