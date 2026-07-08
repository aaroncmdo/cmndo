import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapProposalToTaskParams, PRIO_MAP, assigneeFromClaim, buildTaskFromProposal } from './task-from-proposal'
import type { TaskProposalPayload } from './types'

// Mocks fuer buildTaskFromProposal-Owner-Routing (Claim-Load + createLinkedTask).
const { claimRow, createLinkedTaskSpy } = vi.hoisted(() => ({
  claimRow: { current: null as null | { kundenbetreuer_id: string | null; sv_id: string | null } },
  createLinkedTaskSpy: vi.fn(async (_p: unknown) => ({ task_id: 't1' })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: claimRow.current, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/tasks/create-task', () => ({
  createLinkedTask: (p: unknown) => createLinkedTaskSpy(p),
}))

describe('mapProposalToTaskParams', () => {
  const NOW = 1720310400000 // fixed epoch for deterministic Date assertions
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('(a) volles payload → korrekte Params', () => {
    const payload: TaskProposalPayload = {
      titel: 'Gutachten anfordern',
      beschreibung: 'Bitte SV kontaktieren',
      prioritaet: 'hoch',
      faellig_in_tagen: 3,
    }
    const result = mapProposalToTaskParams(payload, 'sachverstaendiger', 'claim-123', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('Gutachten anfordern')
    expect(result.beschreibung).toBe('Bitte SV kontaktieren')
    expect(result.prioritaet).toBe('dringend') // hoch → dringend
    expect(result.empfaenger_rolle).toBe('sachverstaendiger')
    expect(result.fall_id).toBe('claim-123')
    expect(result.trigger_event).toBe('ai_orchestrator_vorschlag')
    // faellig_am = NOW + 3 * 86400000
    expect(result.faellig_am).toBeInstanceOf(Date)
    expect(result.faellig_am!.getTime()).toBe(NOW + 3 * 86400000)
  })

  it('(b) leeres payload → titel=AI-Vorschlag, prioritaet undefined, faellig_am undefined', () => {
    const payload: TaskProposalPayload = {}
    const result = mapProposalToTaskParams(payload, 'admin', 'claim-456', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('AI-Vorschlag')
    expect(result.prioritaet).toBeUndefined()
    expect(result.faellig_am).toBeUndefined()
  })

  it('(c) zielRolle null → empfaenger_rolle undefined', () => {
    const payload: TaskProposalPayload = { titel: 'Test' }
    const result = mapProposalToTaskParams(payload, null, 'claim-789', 'ai_orchestrator_vorschlag')
    expect(result.empfaenger_rolle).toBeUndefined()
  })

  it('PRIO_MAP: niedrig → normal', () => {
    expect(PRIO_MAP['niedrig']).toBe('normal')
  })
  it('PRIO_MAP: normal → normal', () => {
    expect(PRIO_MAP['normal']).toBe('normal')
  })
  it('PRIO_MAP: hoch → dringend', () => {
    expect(PRIO_MAP['hoch']).toBe('dringend')
  })
  it('PRIO_MAP: dringend → dringend', () => {
    expect(PRIO_MAP['dringend']).toBe('dringend')
  })
  it('PRIO_MAP: kritisch → kritisch', () => {
    expect(PRIO_MAP['kritisch']).toBe('kritisch')
  })
})

// ── Owner-Routing ─────────────────────────────────────────────────────────────
describe('assigneeFromClaim', () => {
  it('KB-Rolle → kundenbetreuer_id', () => {
    expect(assigneeFromClaim({ kundenbetreuer_id: 'kb1', sv_id: null }, 'kundenbetreuer')).toBe('kb1')
  })
  it('SV-Rolle → sv_id', () => {
    expect(assigneeFromClaim({ kundenbetreuer_id: null, sv_id: 'sv1' }, 'sachverstaendiger')).toBe('sv1')
  })
  it('admin/null → null (kein Einzel-Owner)', () => {
    expect(assigneeFromClaim({ kundenbetreuer_id: 'kb1', sv_id: 'sv1' }, 'admin')).toBeNull()
    expect(assigneeFromClaim({ kundenbetreuer_id: 'kb1', sv_id: 'sv1' }, null)).toBeNull()
  })
  it('KB-Rolle aber kein Owner gesetzt → null (Fallback)', () => {
    expect(assigneeFromClaim({ kundenbetreuer_id: null, sv_id: null }, 'kundenbetreuer')).toBeNull()
  })
})

describe('mapProposalToTaskParams empfaengerUserId', () => {
  it('reicht empfaengerUserId als empfaenger_user_id durch', () => {
    const r = mapProposalToTaskParams({ titel: 'X' }, 'kundenbetreuer', 'c1', 'ev', 'kb1')
    expect(r.empfaenger_user_id).toBe('kb1')
  })
  it('ohne empfaengerUserId → empfaenger_user_id undefined', () => {
    const r = mapProposalToTaskParams({ titel: 'X' }, 'kundenbetreuer', 'c1', 'ev')
    expect(r.empfaenger_user_id).toBeUndefined()
  })
})

describe('buildTaskFromProposal owner-routing', () => {
  beforeEach(() => {
    createLinkedTaskSpy.mockClear()
    claimRow.current = null
  })
  it('routet KB-Task an den Fall-Owner (kundenbetreuer_id)', async () => {
    claimRow.current = { kundenbetreuer_id: 'kb-owner', sv_id: null }
    await buildTaskFromProposal({ titel: 'X' }, 'kundenbetreuer', 'c1', 'ev')
    expect(createLinkedTaskSpy).toHaveBeenCalledWith(expect.objectContaining({ empfaenger_user_id: 'kb-owner' }))
  })
  it('routet SV-Task an den Fall-Owner (sv_id)', async () => {
    claimRow.current = { kundenbetreuer_id: null, sv_id: 'sv-owner' }
    await buildTaskFromProposal({ titel: 'X' }, 'sachverstaendiger', 'c1', 'ev')
    expect(createLinkedTaskSpy).toHaveBeenCalledWith(expect.objectContaining({ empfaenger_user_id: 'sv-owner' }))
  })
  it('kein Owner → empfaenger_user_id undefined (Fallback Least-Loaded)', async () => {
    claimRow.current = { kundenbetreuer_id: null, sv_id: null }
    await buildTaskFromProposal({ titel: 'X' }, 'kundenbetreuer', 'c1', 'ev')
    expect(createLinkedTaskSpy).toHaveBeenCalledWith(expect.objectContaining({ empfaenger_user_id: undefined }))
  })
})
