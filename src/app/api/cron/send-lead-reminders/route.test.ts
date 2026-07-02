import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Regression-Guard fuer den Nurture/Timeout-Asymmetrie-Fix (2026-07-02).
describe('send-lead-reminders — Nurture/Timeout-Symmetrie', () => {
  const src = readFileSync('src/app/api/cron/send-lead-reminders/route.ts', 'utf8')
  it('nurtured NICHT nur self_service (Asymmetrie gefixt)', () => {
    expect(src).not.toContain(".eq('source_channel', 'self_service')")
  })
  it('schliesst von der Nurture nur makler/manuell aus (menschl. Follow-up)', () => {
    expect(src).toContain(".not('source_channel', 'in', '(makler-anfrage,manuell)')")
  })
  it('der 7-Tage-Timeout bleibt intakt (mark_expired_leads)', () => {
    expect(src).toContain('mark_expired_leads')
  })
})
