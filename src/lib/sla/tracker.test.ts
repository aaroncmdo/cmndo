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
