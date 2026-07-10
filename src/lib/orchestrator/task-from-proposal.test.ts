import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapProposalToTaskParams, PRIO_MAP, assigneeFromClaim, buildTaskFromProposal } from './task-from-proposal'
import type { TaskProposalPayload } from './types'

// Mocks fuer buildTaskFromProposal-Owner-Routing (Claim-Load + Bridge-Load + createLinkedTask).
// from(table) ist tabellen-aware: 'claims' -> claimRow, 'faelle_claim_bridge' -> bridgeRow.
const { claimRow, bridgeRow, createLinkedTaskSpy } = vi.hoisted(() => ({
  claimRow: { current: null as null | { kundenbetreuer_id: string | null; sv_id: string | null } },
  bridgeRow: { current: null as null | { fall_id: string | null } },
  createLinkedTaskSpy: vi.fn(async (_p: unknown) => ({ task_id: 't1' })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'faelle_claim_bridge' ? bridgeRow.current : claimRow.current,
            error: null,
          }),
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

  it('(a) volles payload → korrekte Params (fall_id aus fallId, claim_id aus claimId)', () => {
    const payload: TaskProposalPayload = {
      titel: 'Gutachten anfordern',
      beschreibung: 'Bitte SV kontaktieren',
      prioritaet: 'hoch',
      faellig_in_tagen: 3,
    }
    const result = mapProposalToTaskParams(payload, 'sachverstaendiger', 'fall-abc', 'claim-123', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('Gutachten anfordern')
    expect(result.beschreibung).toBe('Bitte SV kontaktieren')
    expect(result.prioritaet).toBe('dringend') // hoch → dringend
    expect(result.empfaenger_rolle).toBe('sachverstaendiger')
    // fall_id kommt aus fallId (Bridge-fall_id), NICHT aus claimId — sonst FK-Verletzung.
    expect(result.fall_id).toBe('fall-abc')
    // claim_id ist die claims.id (SSoT-Anker).
    expect(result.claim_id).toBe('claim-123')
    expect(result.trigger_event).toBe('ai_orchestrator_vorschlag')
    // faellig_am = NOW + 3 * 86400000
    expect(result.faellig_am).toBeInstanceOf(Date)
    expect(result.faellig_am!.getTime()).toBe(NOW + 3 * 86400000)
  })

  it('(b) leeres payload → titel=AI-Vorschlag, prioritaet undefined, faellig_am undefined', () => {
    const payload: TaskProposalPayload = {}
    const result = mapProposalToTaskParams(payload, 'admin', 'fall-1', 'claim-456', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('AI-Vorschlag')
    expect(result.prioritaet).toBeUndefined()
    expect(result.faellig_am).toBeUndefined()
    expect(result.claim_id).toBe('claim-456')
  })

  it('(c) zielRolle null → empfaenger_rolle undefined', () => {
    const payload: TaskProposalPayload = { titel: 'Test' }
    const result = mapProposalToTaskParams(payload, null, 'fall-1', 'claim-789', 'ai_orchestrator_vorschlag')
    expect(result.empfaenger_rolle).toBeUndefined()
  })

  it('(d) fallId null → fall_id undefined, claim_id bleibt gesetzt (Bridge-Miss-Fallback)', () => {
    const result = mapProposalToTaskParams({ titel: 'X' }, 'admin', null, 'claim-1', 'ev')
    expect(result.fall_id).toBeUndefined()
    expect(result.claim_id).toBe('claim-1')
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
    const r = mapProposalToTaskParams({ titel: 'X' }, 'kundenbetreuer', 'fall-1', 'c1', 'ev', 'kb1')
    expect(r.empfaenger_user_id).toBe('kb1')
  })
  it('ohne empfaengerUserId → empfaenger_user_id undefined', () => {
    const r = mapProposalToTaskParams({ titel: 'X' }, 'kundenbetreuer', 'fall-1', 'c1', 'ev')
    expect(r.empfaenger_user_id).toBeUndefined()
  })
})

describe('buildTaskFromProposal owner-routing', () => {
  beforeEach(() => {
    createLinkedTaskSpy.mockClear()
    claimRow.current = null
    // Bridge-Zeile vorhanden, damit Owner-Routing-Tests nicht am fall_id haengen.
    bridgeRow.current = { fall_id: 'fall-default' }
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

// ── Bug-Fix: tasks_fall_id_fkey (claim_id wurde faelschlich als fall_id eingefuegt) ──
describe('buildTaskFromProposal fall_id-Aufloesung (Regression FK tasks_fall_id_fkey)', () => {
  beforeEach(() => {
    createLinkedTaskSpy.mockClear()
    claimRow.current = { kundenbetreuer_id: 'kb', sv_id: null }
    bridgeRow.current = null
  })
  it('loest fall_id aus faelle_claim_bridge auf — NIE claim_id als fall_id', async () => {
    bridgeRow.current = { fall_id: 'fall-xyz' }
    await buildTaskFromProposal({ titel: 'X' }, 'kundenbetreuer', 'claim-1', 'ev')
    expect(createLinkedTaskSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fall_id: 'fall-xyz', claim_id: 'claim-1' }),
    )
    // Regressions-Guard: fall_id darf NIE die claim_id sein (das war die FK-Verletzung).
    const arg = createLinkedTaskSpy.mock.calls[0][0] as { fall_id?: string | null }
    expect(arg.fall_id).not.toBe('claim-1')
  })
  it('keine Bridge-Zeile → fall_id undefined, claim_id bleibt Anker', async () => {
    bridgeRow.current = null
    await buildTaskFromProposal({ titel: 'X' }, 'kundenbetreuer', 'claim-1', 'ev')
    expect(createLinkedTaskSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fall_id: undefined, claim_id: 'claim-1' }),
    )
  })
})
