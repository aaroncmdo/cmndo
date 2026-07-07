import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: spies BEFORE vi.mock factories (hoisting workaround)
const { decideSpy, taskSpy, rolleForUser } = vi.hoisted(() => ({
  decideSpy: vi.fn(async () => ({ ok: true })),
  taskSpy: vi.fn(async () => ({ task_id: 't1' })),
  rolleForUser: vi.fn(async () => 'admin' as string | null),
}))

let proposalRow: Record<string, unknown> = {
  id: 'p1',
  claim_id: 'c1',
  vorschlag_typ: 'task',
  ziel_rolle: 'sachverstaendiger',
  payload: { titel: 'X' },
  status: 'offen',
}

vi.mock('@/lib/orchestrator/proposals', () => ({ decideProposal: decideSpy }))
vi.mock('@/lib/orchestrator/task-from-proposal', () => ({ buildTaskFromProposal: taskSpy }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { rolle: await rolleForUser() } }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: proposalRow }),
        }),
      }),
    }),
  }),
}))

import { freigebenAufsichtVorschlag, verwerfenAufsichtVorschlag } from './actions'

beforeEach(() => {
  decideSpy.mockClear()
  taskSpy.mockClear()
  rolleForUser.mockClear()
  rolleForUser.mockResolvedValue('admin')
  proposalRow = {
    id: 'p1',
    claim_id: 'c1',
    vorschlag_typ: 'task',
    ziel_rolle: 'sachverstaendiger',
    payload: { titel: 'X' },
    status: 'offen',
  }
})

describe('freigebenAufsichtVorschlag', () => {
  it('freigeben: buildTaskFromProposal mit claim_id + angenommen', async () => {
    const r = await freigebenAufsichtVorschlag('p1')
    expect(r.ok).toBe(true)
    expect(taskSpy).toHaveBeenCalledWith({ titel: 'X' }, 'sachverstaendiger', 'c1', 'ki_aufsicht_sla')
    expect(decideSpy).toHaveBeenCalledWith('p1', 'angenommen', 'admin-1')
  })

  it('Idempotenz: bereits bearbeiteter Vorschlag wird abgelehnt', async () => {
    proposalRow = { ...proposalRow, status: 'angenommen' }
    const r = await freigebenAufsichtVorschlag('p1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('bereits bearbeitet')
    expect(taskSpy).not.toHaveBeenCalled()
    expect(decideSpy).not.toHaveBeenCalled()
  })

  it('schlaegt fehl wenn task_id null', async () => {
    taskSpy.mockResolvedValueOnce({ task_id: null })
    const r = await freigebenAufsichtVorschlag('p1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Task-Erstellung fehlgeschlagen')
    expect(decideSpy).not.toHaveBeenCalled()
  })

  it('nicht-admin: Nicht berechtigt', async () => {
    rolleForUser.mockResolvedValueOnce('dispatch')
    const r = await freigebenAufsichtVorschlag('p1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Nicht berechtigt')
    expect(taskSpy).not.toHaveBeenCalled()
  })
})

describe('verwerfenAufsichtVorschlag', () => {
  it('verwerfen: decideProposal mit verworfen', async () => {
    const r = await verwerfenAufsichtVorschlag('p1', 'nicht relevant')
    expect(r.ok).toBe(true)
    expect(decideSpy).toHaveBeenCalledWith('p1', 'verworfen', 'admin-1', 'nicht relevant')
  })

  it('Idempotenz: bereits bearbeiteter Vorschlag wird abgelehnt', async () => {
    proposalRow = { ...proposalRow, status: 'verworfen' }
    const r = await verwerfenAufsichtVorschlag('p1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('bereits bearbeitet')
    expect(decideSpy).not.toHaveBeenCalled()
  })
})
