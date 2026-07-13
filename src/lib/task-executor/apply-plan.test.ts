// src/lib/task-executor/apply-plan.test.ts
import { describe, it, expect, vi } from 'vitest'

const { notizApply, schliessenApply } = vi.hoisted(() => ({
  notizApply: vi.fn().mockResolvedValue({ ok: true }),
  schliessenApply: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('./verbs', () => ({
  EXECUTOR_VERBS: [
    { name: 'interne_notiz', risk: 'safe', apply: notizApply },
    { name: 'task_schliessen', risk: 'safe', apply: schliessenApply },
  ],
}))

import { applyPlan } from './apply-plan'
import type { ExecutionPlan, ExecCtx } from './types'

const ctx = { db: {}, task: { id: 't1' }, claimId: 'c1', fallId: 'f1', userId: 'u1' } as unknown as ExecCtx

describe('applyPlan', () => {
  it('fuehrt alle Steps in Reihenfolge aus → ausgefuehrt', async () => {
    const plan: ExecutionPlan = {
      steps: [
        { verb: 'interne_notiz', args: { text: 'a' }, risk: 'safe' },
        { verb: 'task_schliessen', args: { ergebnis: 'b' }, risk: 'safe' },
      ],
      begruendung: 'x', hatConsequential: false,
    }
    const r = await applyPlan(plan, ctx)
    expect(r.status).toBe('ausgefuehrt')
    expect(r.steps.every((s) => s.applied && s.result?.ok)).toBe(true)
    expect(notizApply.mock.invocationCallOrder[0]).toBeLessThan(schliessenApply.mock.invocationCallOrder[0])
  })
  it('stoppt beim ersten Fehler → fehler, Folge-Step nicht ausgefuehrt', async () => {
    notizApply.mockResolvedValueOnce({ ok: false, error: 'nope' })
    schliessenApply.mockClear()
    const plan: ExecutionPlan = {
      steps: [
        { verb: 'interne_notiz', args: {}, risk: 'safe' },
        { verb: 'task_schliessen', args: {}, risk: 'safe' },
      ],
      begruendung: 'x', hatConsequential: false,
    }
    const r = await applyPlan(plan, ctx)
    expect(r.status).toBe('fehler')
    expect(r.fehler).toContain('nope')
    expect(schliessenApply).not.toHaveBeenCalled()
  })
})
