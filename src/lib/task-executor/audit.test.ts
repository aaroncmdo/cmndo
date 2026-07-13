// src/lib/task-executor/audit.test.ts
import { describe, it, expect, vi } from 'vitest'
import { insertExecution, markExecution, getOffeneExecution, getExecution } from './audit'
import type { ExecutionPlan, PlanStep } from './types'

// mockDb builds a minimal Supabase query-builder mock chain.
// The chain shape must match the actual call order in audit.ts:
//   insert -> .insert(payload).select('id').single()
//   update -> .update(patch).eq('id', id)
//   select (maybeSingle) -> .select(...).eq(...).maybeSingle()
//   select (maybeSingle with in) -> .select(...).eq(...).in(...).maybeSingle()

function mockSingle(returns: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returns, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { from: vi.fn().mockReturnValue({ insert }), _insert: insert, _select: select, _single: single }
}

function mockMaybeSingle(returns: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: returns, error: null })
  const inFn = vi.fn().mockReturnValue({ maybeSingle })
  const eq = vi.fn().mockReturnValue({ maybeSingle, in: inFn })
  const select = vi.fn().mockReturnValue({ eq })
  return { from: vi.fn().mockReturnValue({ select }), _select: select, _eq: eq, _maybeSingle: maybeSingle }
}

function mockUpdate(error: null | { message: string } = null) {
  const eq = vi.fn().mockResolvedValue({ data: null, error })
  const update = vi.fn().mockReturnValue({ eq })
  return { from: vi.fn().mockReturnValue({ update }), _update: update, _eq: eq }
}

// Canonical test plan
const plan: ExecutionPlan = {
  steps: [{ verb: 'interne_notiz', args: { text: 'x' }, risk: 'safe' }],
  begruendung: 'b',
  hatConsequential: false,
}

// ── insertExecution ─────────────────────────────────────────────────────────

describe('insertExecution', () => {
  it('inserted mit status=geplant + plan.steps + gibt id zurueck', async () => {
    const db = mockSingle({ id: 'e1' })
    const r = await insertExecution(db as never, {
      taskId: 't1',
      claimId: 'c1',
      typ: 'sa_ausstehend',
      plan,
      modell: 'm',
      userId: 'u1',
    })
    expect(r?.id).toBe('e1')
    const payload = db._insert.mock.calls[0][0]
    expect(payload).toMatchObject({
      task_id: 't1',
      claim_id: 'c1',
      status: 'geplant',
      modell: 'm',
      gestartet_von: 'u1',
    })
    // plan column stores steps array, not the whole ExecutionPlan
    expect(payload.plan).toEqual(plan.steps)
    // begruendung stored separately
    expect(payload.begruendung).toBe('b')
  })

  it('gibt null zurueck bei DB-Fehler', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'db fail' } })
    const select = vi.fn().mockReturnValue({ single: maybeSingle })
    const insert = vi.fn().mockReturnValue({ select })
    const db = { from: vi.fn().mockReturnValue({ insert }) }
    const r = await insertExecution(db as never, {
      taskId: 't1',
      claimId: 'c1',
      typ: 'sa_ausstehend',
      plan,
      modell: 'm',
      userId: 'u1',
    })
    expect(r).toBeNull()
  })
})

// ── markExecution ────────────────────────────────────────────────────────────

describe('markExecution', () => {
  it('setzt status im update-payload', async () => {
    const db = mockUpdate()
    await markExecution(db as never, 'e1', { status: 'ausgefuehrt' })
    const patch = db._update.mock.calls[0][0]
    expect(patch.status).toBe('ausgefuehrt')
    // Endzustand => abgeschlossen_am gesetzt
    expect(patch.abgeschlossen_am).toBeDefined()
  })

  it('setzt abgeschlossen_am NICHT bei Nicht-Endzustand', async () => {
    const db = mockUpdate()
    await markExecution(db as never, 'e1', { status: 'warte_bestaetigung' })
    const patch = db._update.mock.calls[0][0]
    expect(patch.abgeschlossen_am).toBeUndefined()
  })

  it('nimmt optionale Felder steps/bestaetigtVon/fehler auf', async () => {
    const db = mockUpdate()
    const steps: PlanStep[] = [{ verb: 'interne_notiz', args: {}, risk: 'safe', applied: true }]
    await markExecution(db as never, 'e1', {
      status: 'ausgefuehrt',
      steps,
      bestaetigtVon: 'u2',
      fehler: 'keiner',
    })
    const patch = db._update.mock.calls[0][0]
    expect(patch.plan).toEqual(steps)
    expect(patch.bestaetigt_von).toBe('u2')
    expect(patch.fehler).toBe('keiner')
  })
})

// ── getOffeneExecution ───────────────────────────────────────────────────────

describe('getOffeneExecution', () => {
  it('gibt id/status/plan zurueck wenn vorhanden', async () => {
    const row = { id: 'e1', status: 'geplant', plan: plan.steps }
    const db = mockMaybeSingle(row)
    const r = await getOffeneExecution(db as never, 't1')
    expect(r?.id).toBe('e1')
    expect(r?.status).toBe('geplant')
    expect(r?.plan).toEqual(plan.steps)
  })

  it('gibt null zurueck wenn kein offener Execution', async () => {
    const db = mockMaybeSingle(null)
    const r = await getOffeneExecution(db as never, 't1')
    expect(r).toBeNull()
  })

  it('normalisiert fehlende plan-Column zu leerem Array', async () => {
    const row = { id: 'e1', status: 'geplant', plan: null }
    const db = mockMaybeSingle(row)
    const r = await getOffeneExecution(db as never, 't1')
    expect(r?.plan).toEqual([])
  })
})

// ── getExecution ─────────────────────────────────────────────────────────────

describe('getExecution', () => {
  it('gibt vollstaendige Execution zurueck', async () => {
    const row = { id: 'e1', task_id: 't1', claim_id: 'c1', status: 'ausgefuehrt', plan: plan.steps }
    const db = mockMaybeSingle(row)
    const r = await getExecution(db as never, 'e1')
    expect(r?.id).toBe('e1')
    expect(r?.task_id).toBe('t1')
    expect(r?.claim_id).toBe('c1')
    expect(r?.status).toBe('ausgefuehrt')
    expect(r?.plan).toEqual(plan.steps)
  })

  it('gibt null zurueck wenn nicht gefunden', async () => {
    const db = mockMaybeSingle(null)
    const r = await getExecution(db as never, 'nope')
    expect(r).toBeNull()
  })

  it('normalisiert fehlende plan-Column zu leerem Array', async () => {
    const row = { id: 'e1', task_id: 't1', claim_id: null, status: 'geplant', plan: null }
    const db = mockMaybeSingle(row)
    const r = await getExecution(db as never, 'e1')
    expect(r?.plan).toEqual([])
    expect(r?.claim_id).toBeNull()
  })
})
