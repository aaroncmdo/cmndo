import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Source-guard: completeSla auto-resolves the linked sla_breach task (FG7 Task 3).
// Mirrors the pattern from src/app/api/cron/send-lead-reminders/route.test.ts.
describe('tracker.ts — completeSla task-cancel wiring (source-guard)', () => {
  const src = readFileSync('src/lib/sla/tracker.ts', 'utf8')

  it('imports resolveSlaBreachTaskCancel from ./task-resolution', () => {
    expect(src).toContain("from './task-resolution'")
    expect(src).toContain('resolveSlaBreachTaskCancel')
  })

  it('references eskalation_task_id (the link column)', () => {
    expect(src).toContain('eskalation_task_id')
  })

  it('gates the task cancel to open tasks with .eq("status", "offen")', () => {
    expect(src).toContain(".eq('status', 'offen')")
  })
})

// Source-guard: checkAndEscalateBreaches live completion re-check + kanzlei guard (FG7 Task 4).
describe('tracker.ts — checkAndEscalateBreaches completion re-check (source-guard)', () => {
  const src = readFileSync('src/lib/sla/tracker.ts', 'utf8')

  it('references deriveSvSlaCompletion (live completion re-check called in cron)', () => {
    expect(src).toContain('deriveSvSlaCompletion')
  })

  it('pending select has a target_rolle / kanzlei guard to prevent kanzlei leak', () => {
    expect(src).toContain('target_rolle')
    expect(src).toContain("'kanzlei'")
  })

  it('ordering guard: completion re-check precedes task insert', () => {
    const derivationIdx = src.indexOf('deriveSvSlaCompletion(typ')
    const taskInsertIdx = src.indexOf("typ: 'sla_breach'")
    expect(derivationIdx).toBeGreaterThan(0)
    expect(taskInsertIdx).toBeGreaterThan(0)
    expect(derivationIdx).toBeLessThan(taskInsertIdx)
  })

  it('qc_filmcheck is excluded from the completion re-check', () => {
    expect(src).toContain("'qc_filmcheck'")
  })
})
