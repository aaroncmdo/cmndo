/* eslint-disable @typescript-eslint/no-explicit-any */
// FG7 wired integration smoke: checkAndEscalateBreaches decides against LIVE claim state.
//
// Runs the REAL checkAndEscalateBreaches + completeSla + deriveSvSlaCompletion +
// resolveSlaBreachTaskCancel against a queue-based mock admin client (pattern mirrors
// src/lib/leads/__tests__/convert-lead-to-claim.test.ts). No real DB — proves the
// orchestration/decision behaviour the source-guards could not:
//   1. progressed claim  -> overdue SLA is COMPLETED + breach-task auto-resolved (NOT escalated)
//   2. genuinely-stuck claim -> overdue SLA IS escalated (kritisch sla_breach task created)
//   3. empty pending set -> no-op
//   4. pending select carries the target_rolle kanzlei-exclusion guard

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Op = { table: string; op: string; payload?: any; filters: Array<{ m: string; a: any[] }> }

let operations: Op[] = []
let queue: Array<{ data: unknown; error?: unknown; count?: number }> = []
const next = () => queue.shift() ?? { data: null, error: null }

function builder(op: Op): any {
  const h: any = {}
  for (const m of ['eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'in', 'not', 'is', 'like', 'ilike', 'limit', 'order']) {
    h[m] = (...a: any[]) => {
      op.filters.push({ m, a })
      return h
    }
  }
  h.select = (...a: any[]) => {
    op.filters.push({ m: 'select', a })
    return h
  }
  h.single = () => Promise.resolve(next())
  h.maybeSingle = () => Promise.resolve(next())
  h.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(res, rej)
  return h
}

const mockAdmin = {
  from(table: string) {
    return {
      select: (...a: any[]) => {
        const op: Op = { table, op: 'select', filters: [] }
        operations.push(op)
        return builder(op).select(...a)
      },
      insert: (payload: any) => {
        const op: Op = { table, op: 'insert', payload, filters: [] }
        operations.push(op)
        return builder(op)
      },
      update: (payload: any) => {
        const op: Op = { table, op: 'update', payload, filters: [] }
        operations.push(op)
        return builder(op)
      },
      delete: () => {
        const op: Op = { table, op: 'delete', filters: [] }
        operations.push(op)
        return builder(op)
      },
    }
  },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdmin }))

// deriveSvSlaCompletion + resolveSlaBreachTaskCancel stay REAL — only the DB is mocked.
import { checkAndEscalateBreaches } from './tracker'

beforeEach(() => {
  operations = []
  queue = []
})

const OVERDUE = '2020-01-01T00:00:00.000Z'

describe('FG7 checkAndEscalateBreaches — derive-at-read (wired, mocked DB)', () => {
  it('progressed claim: overdue SLA is COMPLETED + breach-task auto-resolved, NOT escalated', async () => {
    queue = [
      // 1) pending select
      { data: [{ id: 'sla-1', fall_id: 'fall-1', claim_id: 'claim-1', sla_typ: 'gutachter_zuweisung', breach_at: OVERDUE }] },
      // 2) claims read — claim is at 'besichtigung' (past the gutachter_zuweisung threshold sv-zugewiesen)
      { data: { claim_nummer: 'C-1', operative_status: 'besichtigung' } },
      // 3) completeSla update+select returns the row with a linked task
      { data: [{ id: 'sla-1', eskalation_task_id: 'task-1' }] },
      // 4) task-cancel update
      { data: null },
    ]

    const res = await checkAndEscalateBreaches()

    expect(res).toEqual({ neueBreaches: 0, tasksErstellt: 0 })
    // NO sla_breach task was inserted (no false escalation)
    expect(operations.find((o) => o.table === 'tasks' && o.op === 'insert')).toBeUndefined()
    // sla_tracking was flipped to completed (completeSla ran)
    expect(
      operations.find((o) => o.table === 'sla_tracking' && o.op === 'update' && o.payload?.status === 'completed'),
    ).toBeDefined()
    // the linked task was auto-resolved to 'erledigt' with the erledigt_am + auto_resolved marker, gated to open tasks
    const cancel = operations.find((o) => o.table === 'tasks' && o.op === 'update' && o.payload?.status === 'erledigt')
    expect(cancel).toBeDefined()
    expect(cancel!.payload.erledigt_am).toBeTruthy()
    expect(cancel!.payload.auto_resolved_am).toBeTruthy()
    expect(cancel!.filters).toContainEqual({ m: 'eq', a: ['status', 'offen'] })
  })

  it('genuinely-stuck claim: overdue SLA IS escalated (kritisch sla_breach task created)', async () => {
    queue = [
      // 1) pending select
      { data: [{ id: 'sla-2', fall_id: 'fall-2', claim_id: 'claim-2', sla_typ: 'gutachter_zuweisung', breach_at: OVERDUE }] },
      // 2) claims read — still at 'sv-gesucht' (BELOW the sv-zugewiesen threshold) -> not complete
      { data: { claim_nummer: 'C-2', operative_status: 'sv-gesucht' } },
      // 3) task insert .select('id').single()
      { data: { id: 'task-2' } },
      // 4) sla_tracking update -> breached
      { data: null },
      // 5) timeline insert
      { data: null },
    ]

    const res = await checkAndEscalateBreaches()

    expect(res).toEqual({ neueBreaches: 1, tasksErstellt: 1 })
    const insert = operations.find((o) => o.table === 'tasks' && o.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.payload.typ).toBe('sla_breach')
    expect(insert!.payload.prioritaet).toBe('kritisch')
    // sla_tracking flipped to breached
    expect(
      operations.find((o) => o.table === 'sla_tracking' && o.op === 'update' && o.payload?.status === 'breached'),
    ).toBeDefined()
  })

  it('empty pending set: no-op (no inserts)', async () => {
    queue = [{ data: [] }]
    const res = await checkAndEscalateBreaches()
    expect(res).toEqual({ neueBreaches: 0, tasksErstellt: 0 })
    expect(operations.filter((o) => o.op === 'insert')).toHaveLength(0)
  })

  it('pending select excludes kanzlei rows (target_rolle guard)', async () => {
    queue = [{ data: [] }]
    await checkAndEscalateBreaches()
    const sel = operations.find((o) => o.table === 'sla_tracking' && o.op === 'select')
    expect(sel).toBeDefined()
    expect(sel!.filters).toContainEqual({ m: 'neq', a: ['target_rolle', 'kanzlei'] })
  })
})
