import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Regression-Guard: Nurture/Timeout-Asymmetrie-Fix (#3489) + 4. Reminder (Follow-up 1)
// + Kaskaden-Gate (17.07.2026). Die Kaskade erreicht alle kundengetriebenen Akquise-
// Channels; der channel-agnostische 10-Tage-Timeout disqualifiziert dahinter. Das Gate
// verhindert den Alt-Lead-Burst: ein nie genurtureter Bestands-Lead (>168h) matcht sonst
// ALLE vier Kohorten im selben Cron-Tick -> bis zu 4 Mails auf einmal.
const src = () => readFileSync('src/app/api/cron/send-lead-reminders/route.ts', 'utf8')

describe('send-lead-reminders — Nurture/Timeout + 4. Reminder', () => {
  it('nurtured NICHT nur self_service (Asymmetrie gefixt)', () => {
    expect(src()).not.toContain(".eq('source_channel', 'self_service')")
  })

  it('schliesst von der Nurture nur makler/manuell aus', () => {
    expect(src()).toContain(".not('source_channel', 'in', '(makler-anfrage,manuell)')")
  })

  it('der Timeout bleibt intakt (mark_expired_leads)', () => {
    expect(src()).toContain('mark_expired_leads')
  })

  it('hat eine 4. Reminder-Kohorte (reminder_4_sent_at + cohort4, 168h/Tag 7)', () => {
    expect(src()).toContain('reminder_4_sent_at')
    expect(src()).toContain('cohort4')
    expect(src()).toContain('168 * 60 * 60 * 1000')
  })
})

describe('send-lead-reminders — Kaskaden-Gate (17.07.2026)', () => {
  it('Stufe N laedt Kandidaten nur mit gesendeter Stufe N-1 (kein Multi-Mail-Burst im selben Tick)', () => {
    expect(src()).toContain("'reminder_2_sent_at', 'reminder_1_sent_at'")
    expect(src()).toContain("'reminder_3_sent_at', 'reminder_2_sent_at'")
    expect(src()).toContain("'reminder_4_sent_at', 'reminder_3_sent_at'")
  })

  it('Mindestabstand zwischen zwei Stufen existiert (Alt-Lead-Drossel statt Stufen-Treppe im Stundentakt)', () => {
    expect(src()).toContain('MIN_STUFEN_ABSTAND_MS')
  })
})
