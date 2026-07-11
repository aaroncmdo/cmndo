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

import { starteKiAusfuehrung } from './ki-actions'
import { planTaskExecution } from '@/lib/task-executor/run'
import { applyPlan } from '@/lib/task-executor/apply-plan'
import { markExecution } from '@/lib/task-executor/audit'

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
})
