// P4 (Invariante Spec 3 §4): keine Werkstatt-Zuweisung vor Kunden-Bestaetigung — GESCOPED auf
// abrechnungsweg='haftpflicht'. Kasko/Selbstzahler waehlen die Werkstatt legitim VOR jeder SA
// (partieller Quali-Claim) — deren FlowLink-Step darf NICHT brechen (Plan-Abweichung, live
// verifiziert 30.07.).
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Op = { table: string; op: string; payload?: unknown }
const operations: Op[] = []
let claimRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const c: any = {}
      let isWrite = false
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = () =>
        Promise.resolve({ data: table === 'claims' ? claimRow : null, error: null })
      c.update = (p: unknown) => {
        isWrite = true
        operations.push({ table, op: 'update', payload: p })
        return c
      }
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(isWrite ? { error: null } : { data: null, error: null }).then(res)
      return c
    },
  }),
}))
vi.mock('@/lib/faelle/reparatur-cursor', () => ({
  advanceReparaturCursorTo: vi.fn(),
  fallIdForClaim: vi.fn(async () => null),
}))
vi.mock('@/lib/werkstatt/finder', () => ({ findWerkstaetten: vi.fn(async () => []) }))
vi.mock('@/lib/werkstatt/bedarf/ermittle-bedarf', () => ({
  ermittleReparaturbedarf: vi.fn(async () => ({ kategorien: [], quelle: 'unbekannt', confidence: 0 })),
}))
vi.mock('@/lib/netzwerk/freunde', () => ({ ladeFreundKandidatIds: vi.fn(async () => new Set()) }))

import { assignReparaturWerkstatt } from '../vermittlung-server'

beforeEach(() => {
  operations.length = 0
  claimRow = null
})

const input = {
  target: 'claim' as const,
  id: 'c1',
  werkstattId: 'w1',
  quelle: 'gutachter' as const,
  actorUserId: 'u1',
}

describe('assignReparaturWerkstatt — P4 SA-Gate (haftpflicht-gescoped)', () => {
  it('haftpflicht + sa_unterschrieben=false (SV-Sofort-Claim) -> {ok:false}, KEIN Update', async () => {
    claimRow = { id: 'c1', sa_unterschrieben: false, abrechnungsweg: 'haftpflicht' }
    const r = await assignReparaturWerkstatt(input)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('bestätigt')
    expect(operations.filter((o) => o.op === 'update')).toHaveLength(0)
  })

  it('haftpflicht + sa_unterschrieben=true -> Zuweisung laeuft (Update passiert)', async () => {
    claimRow = { id: 'c1', sa_unterschrieben: true, abrechnungsweg: 'haftpflicht' }
    const r = await assignReparaturWerkstatt(input)
    expect(r.ok).toBe(true)
    expect(operations.filter((o) => o.table === 'claims' && o.op === 'update').length).toBeGreaterThan(0)
  })

  it('selbstzahler + sa_unterschrieben=false -> KEIN Gate (FlowLink-Quali-Step, Alt-Verhalten)', async () => {
    claimRow = { id: 'c1', sa_unterschrieben: false, abrechnungsweg: 'selbstzahler' }
    const r = await assignReparaturWerkstatt(input)
    expect(r.ok).toBe(true)
    expect(operations.filter((o) => o.table === 'claims' && o.op === 'update').length).toBeGreaterThan(0)
  })

  it('target=lead ohne existierenden Claim -> KEIN Gate (reiner Lead-Vorgang, Alt-Verhalten)', async () => {
    claimRow = null
    const r = await assignReparaturWerkstatt({ ...input, target: 'lead' as never })
    expect(r.ok).toBe(true)
    expect(operations.filter((o) => o.table === 'leads' && o.op === 'update').length).toBeGreaterThan(0)
  })
})
