import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Source-guard: locks CRON WIRING only — route → tracker delegate + auth guard +
// FG7 completion re-check + kanzlei-leak guard. Detailed completion-branch ordering
// and eskalation_task_id contracts are unit-locked separately in tracker.test.ts (Tasks 3-4).
describe('sla-check cron — Wiring source-guard', () => {
  const routeSrc = readFileSync('src/app/api/cron/sla-check/route.ts', 'utf8')
  const trackerSrc = readFileSync('src/lib/sla/tracker.ts', 'utf8')

  describe('route.ts → delegates + auth', () => {
    it('delegiert an checkAndEscalateBreaches', () => {
      expect(routeSrc).toContain('checkAndEscalateBreaches')
    })

    it('bewacht den Cron-Endpoint mit assertCronAuth', () => {
      expect(routeSrc).toContain('assertCronAuth')
    })

    it('liefert 401 bei unberechtigtem Zugriff', () => {
      expect(routeSrc).toContain('401')
    })
  })

  describe('tracker.ts → FG7-Vertraege', () => {
    it('enthaelt den Completion-Re-Check-Aufruf (deriveSvSlaCompletion)', () => {
      expect(trackerSrc).toContain('deriveSvSlaCompletion(typ,')
    })

    it('enthaelt den kanzlei-Leak-Guard (target_rolle)', () => {
      expect(trackerSrc).toContain('target_rolle')
    })
  })
})
