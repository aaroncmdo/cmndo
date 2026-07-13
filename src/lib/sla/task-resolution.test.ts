import { describe, it, expect } from 'vitest'
import { resolveSlaBreachTaskCancel, type TaskStatus } from './task-resolution'

// Compile-time guard: 'abgebrochen' is NOT a valid task_status enum member.
// The @ts-expect-error MUST stay — if this line stops erroring tsc will report an
// "unused @ts-expect-error" which makes the typecheck FAIL. That pins the type contract.
// @ts-expect-error 'abgebrochen' is not a valid task_status enum member
const _bad: TaskStatus = 'abgebrochen'

describe('resolveSlaBreachTaskCancel', () => {
  const NOW = new Date('2026-07-13T10:00:00.000Z')

  describe('status field', () => {
    it('is always "erledigt" (the valid auto-resolve status)', () => {
      expect(resolveSlaBreachTaskCancel(NOW).status).toBe('erledigt')
    })

    it('is still "erledigt" when a grund is passed', () => {
      expect(resolveSlaBreachTaskCancel(NOW, 'x').status).toBe('erledigt')
    })
  })

  describe('auto_resolved_am', () => {
    it('equals now.toISOString()', () => {
      expect(resolveSlaBreachTaskCancel(NOW).auto_resolved_am).toBe(
        '2026-07-13T10:00:00.000Z',
      )
    })

    it('reflects the passed date exactly', () => {
      const d = new Date('2025-01-01T00:00:00.000Z')
      expect(resolveSlaBreachTaskCancel(d).auto_resolved_am).toBe(d.toISOString())
    })
  })

  describe('auto_resolved_grund', () => {
    it('has a non-empty default string when no grund is passed', () => {
      const { auto_resolved_grund } = resolveSlaBreachTaskCancel(NOW)
      expect(typeof auto_resolved_grund).toBe('string')
      expect(auto_resolved_grund.length).toBeGreaterThan(0)
    })

    it('returns the passed grund verbatim', () => {
      expect(resolveSlaBreachTaskCancel(NOW, 'x').auto_resolved_grund).toBe('x')
    })

    it('returns a longer passed grund verbatim', () => {
      const g = 'SV-Besichtigung abgeschlossen — SLA termin_bestaetigung erledigt'
      expect(resolveSlaBreachTaskCancel(NOW, g).auto_resolved_grund).toBe(g)
    })
  })

  describe('pure function — no side effects', () => {
    it('returns a new object on each call (not a singleton)', () => {
      const a = resolveSlaBreachTaskCancel(NOW)
      const b = resolveSlaBreachTaskCancel(NOW)
      expect(a).not.toBe(b)
    })

    it('does not mutate the input date', () => {
      const d = new Date('2026-07-13T10:00:00.000Z')
      const before = d.getTime()
      resolveSlaBreachTaskCancel(d)
      expect(d.getTime()).toBe(before)
    })
  })
})
