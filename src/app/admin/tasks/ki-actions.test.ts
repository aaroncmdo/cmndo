// src/app/admin/tasks/ki-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock hoisting, so refs inside mock factories are safe.
const { userScopedDb, adminDb, TASK } = vi.hoisted(() => {
  const TASK = {
    id: 't1',
    typ: 'sa_ausstehend',
    titel: 'SA',
    beschreibung: null,
    status: 'offen',
    claim_id: 'c1',
    fall_id: 'f1',
    empfaenger_rolle: null,
  }
  // Minimaler user-scoped Task-Loader: .from('tasks').select().eq().maybeSingle()
  const userScopedDb = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: TASK, error: null }) }),
      }),
    })),
  }
  const adminDb = {}
  return { userScopedDb, adminDb, TASK }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/guards', () => ({
  requireRole: vi.fn().mockResolvedValue({ success: true, user: { id: 'u1' }, supabase: userScopedDb }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => userScopedDb) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminDb) }))
vi.mock('@/lib/task-executor/policy', () => ({ isExecutorEnabled: vi.fn(() => true) }))
vi.mock('@/lib/task-executor/registry', () => ({
  executableTypeFor: vi.fn(() => ({ label: 'SA ausstehend', promptHint: '' })),
  buildExecutorSystem: vi.fn(() => 'system'),
}))
vi.mock('@/lib/task-executor/run', () => ({ planTaskExecution: vi.fn() }))
vi.mock('@/lib/task-executor/apply-plan', () => ({ applyPlan: vi.fn() }))
vi.mock('@/lib/task-executor/audit', () => ({
  insertExecution: vi.fn().mockResolvedValue({ id: 'e1' }),
  markExecution: vi.fn().mockResolvedValue(undefined),
  getOffeneExecution: vi.fn().mockResolvedValue(null),
  getExecution: vi.fn(),
}))

import { starteKiAusfuehrung, bestaetigeKiAusfuehrung, brichAbKiAusfuehrung } from './ki-actions'
import { executableTypeFor } from '@/lib/task-executor/registry'
import { planTaskExecution } from '@/lib/task-executor/run'
import { applyPlan } from '@/lib/task-executor/apply-plan'
import { markExecution, getExecution } from '@/lib/task-executor/audit'
import { createClient } from '@/lib/supabase/server'

beforeEach(() => vi.clearAllMocks())

describe('starteKiAusfuehrung', () => {
  it('safe-Plan → sofort ausgefuehrt', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [{ verb: 'interne_notiz', args: {}, risk: 'safe' }],
      begruendung: 'b',
      hatConsequential: false,
    })
    ;(applyPlan as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ausgefuehrt', steps: [] })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(true)
    expect(r.execution?.status).toBe('ausgefuehrt')
    expect(applyPlan).toHaveBeenCalled()
  })

  it('consequential-Plan → warte_bestaetigung, kein applyPlan', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [{ verb: 'sende_kommunikation', args: {}, risk: 'consequential' }],
      begruendung: 'b',
      hatConsequential: true,
    })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(true)
    expect(r.execution?.status).toBe('warte_bestaetigung')
    expect(applyPlan).not.toHaveBeenCalled()
  })

  it('leerer Plan → ok:false, kein Insert', async () => {
    ;(planTaskExecution as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [],
      begruendung: '',
      hatConsequential: false,
    })
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(false)
  })

  it('executableTypeFor returns null → ok:false, planTaskExecution not called', async () => {
    // Override the mock: this task type is not KI-ausfuehrbar.
    ;(executableTypeFor as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
    const r = await starteKiAusfuehrung('t1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nicht KI-ausfuehrbar/)
    expect(planTaskExecution).not.toHaveBeenCalled()
  })
})

describe('bestaetigeKiAusfuehrung', () => {
  // Helper: a minimal execution row in warte_bestaetigung state.
  const EXEC_WAITING = {
    id: 'e1',
    task_id: 't1',
    status: 'warte_bestaetigung',
    plan: [{ verb: 'sende_kommunikation', args: {}, risk: 'consequential' }],
  }

  it('security: task RLS-recheck fails (no task access) → ok:false, applyPlan not called', async () => {
    // getExecution returns a valid waiting execution...
    ;(getExecution as ReturnType<typeof vi.fn>).mockResolvedValueOnce(EXEC_WAITING)
    // ...but the user-scoped task load returns null (RLS blocks access).
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      })),
    })
    const r = await bestaetigeKiAusfuehrung('e1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Kein Zugriff/)
    // Security-critical: applyPlan must NOT have been called.
    expect(applyPlan).not.toHaveBeenCalled()
  })

  it('wrong status (ausgefuehrt) → ok:false, applyPlan not called', async () => {
    ;(getExecution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...EXEC_WAITING,
      status: 'ausgefuehrt',
    })
    const r = await bestaetigeKiAusfuehrung('e1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/nicht.*bestaetigbar/)
    expect(applyPlan).not.toHaveBeenCalled()
  })

  it('happy path: warte_bestaetigung + task accessible + applyPlan ok → ok:true, markExecution with bestaetigtVon', async () => {
    ;(getExecution as ReturnType<typeof vi.fn>).mockResolvedValueOnce(EXEC_WAITING)
    // createClient returns the default userScopedDb (TASK available via RLS).
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userScopedDb)
    ;(applyPlan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 'ausgefuehrt', steps: [] })
    const r = await bestaetigeKiAusfuehrung('e1')
    expect(r.ok).toBe(true)
    // markExecution must have been called with bestaetigtVon = 'u1' (the authed userId).
    expect(markExecution).toHaveBeenCalledWith(
      adminDb,
      'e1',
      expect.objectContaining({ bestaetigtVon: 'u1' }),
    )
  })
})

describe('brichAbKiAusfuehrung', () => {
  it('warte_bestaetigung → ok:true, markExecution called with status abgebrochen', async () => {
    ;(getExecution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'e1',
      task_id: 't1',
      status: 'warte_bestaetigung',
      plan: [],
    })
    const r = await brichAbKiAusfuehrung('e1')
    expect(r.ok).toBe(true)
    expect(markExecution).toHaveBeenCalledWith(adminDb, 'e1', { status: 'abgebrochen' })
  })

  it('non-warte_bestaetigung status (ausgefuehrt) → ok:false', async () => {
    ;(getExecution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'e1',
      task_id: 't1',
      status: 'ausgefuehrt',
      plan: [],
    })
    const r = await brichAbKiAusfuehrung('e1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/koennen abgebrochen/)
    expect(markExecution).not.toHaveBeenCalled()
  })
})
