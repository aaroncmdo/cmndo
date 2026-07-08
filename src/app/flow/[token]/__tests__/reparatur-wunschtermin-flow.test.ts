// SP2 Task 3: Unit-Tests fuer speichereReparaturWunschterminFlow.
// Mock-Strategie: queue-basierter Supabase-Admin-Builder (Idiom: beratungstermin-actions.test.ts).
// Jede terminale Operation (maybeSingle / awaited .eq()-Kette) dequeued die naechste Response.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase Admin Mock ─────────────────────────────────────────────────────

let responseQueue: Array<{ data: unknown; error: unknown }> = []

function nextResponse() {
  return responseQueue.shift() ?? { data: null, error: null }
}

function primeResponses(rs: Array<{ data: unknown; error?: unknown }>) {
  responseQueue = rs.map((r) => ({ data: r.data, error: r.error ?? null }))
}

// Tracks update() calls so we can assert on their argument
const updateCalls: unknown[] = []

function makeBuilder() {
  const handler: Record<string, unknown> = {}
  handler.select = () => handler
  handler.eq = () => handler
  handler.or = () => handler
  handler.in = () => handler
  handler.order = () => handler
  handler.limit = () => handler
  handler.maybeSingle = () => Promise.resolve(nextResponse())
  handler.single = () => Promise.resolve(nextResponse())
  // .update().eq() chain: the final .eq() is awaited directly (no maybeSingle)
  handler.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResponse()).then(resolve)
  return handler
}

const mockAdmin = {
  from(_table: string) {
    return {
      select: () => makeBuilder(),
      update: (payload: unknown) => {
        updateCalls.push(payload)
        return makeBuilder()
      },
      insert: () => makeBuilder(),
    }
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Diese Module werden von self-service-actions.ts importiert, aber von
// speichereReparaturWunschterminFlow nicht verwendet — als No-Ops mocken.
vi.mock('@/lib/self-service/quali-gate', () => ({ bewerteSchuldfrage: vi.fn() }))
vi.mock('@/lib/sv-matching-modul', () => ({
  matchAndSlots: vi.fn(),
  planeTerminOeffentlich: vi.fn(),
}))
vi.mock('@/lib/self-service/merge-fixer-alternativen', () => ({
  mergeFixerUndAlternativen: vi.fn(),
}))
vi.mock('@/lib/self-service/flow-resolver', () => ({
  resolveFlowTerminState: vi.fn(),
}))
vi.mock('@/lib/termine/engine', () => ({ planeTermin: vi.fn() }))
vi.mock('@/lib/ocr/apply-zb1-to-lead', () => ({ buildZb1LeadUpdate: vi.fn() }))
vi.mock('@/lib/mapbox/geocode', () => ({ geocodeAdresse: vi.fn() }))
vi.mock('../werkstatt-geo-fallback', () => ({ resolveWerkstattFallbackGeo: vi.fn() }))
vi.mock('@/lib/werkstatt/vermittlung-server', () => ({
  assignReparaturWerkstatt: vi.fn(),
  findReparaturWerkstaettenForTarget: vi.fn(),
}))
vi.mock('@/lib/werkstatt/vermittlung-core', () => ({
  brauchtWerkstattVermittlung: vi.fn(),
}))

// ─── Import (after mocks) ────────────────────────────────────────────────────

import { speichereReparaturWunschterminFlow } from '../self-service-actions'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** flow_links-Lookup-Response: Token gefunden -> lead_id zurueckgeben */
const flowLinkFound = (leadId: string) => ({ data: { lead_id: leadId, expires_at: null } })
/** flow_links-Lookup-Response: Token nicht gefunden */
const flowLinkNotFound = { data: null }

beforeEach(() => {
  vi.clearAllMocks()
  responseQueue = []
  updateCalls.length = 0
})

// ─── speichereReparaturWunschterminFlow ─────────────────────────────────────

describe('speichereReparaturWunschterminFlow', () => {
  it('gibt ok:false bei leerem Token (kein DB-Aufruf)', async () => {
    const r = await speichereReparaturWunschterminFlow('', '2026-07-10T10:00')
    expect(r.ok).toBe(false)
    expect(updateCalls).toHaveLength(0)
  })

  it('gibt ok:false bei leerem Wunschtermin (kein DB-Aufruf)', async () => {
    const r = await speichereReparaturWunschterminFlow('valid-token', '')
    expect(r.ok).toBe(false)
    expect(updateCalls).toHaveLength(0)
  })

  it('gibt ok:false wenn flow_links kein lead_id liefert (fremder/fehlender Token)', async () => {
    // Backward-compat: Token ist direkt die lead_id wenn flow_links nichts findet,
    // aber wir wollen auch den Fall testen, dass der Link fehlt.
    // Hier simulieren wir: flow_links liefert { lead_id: null }.
    primeResponses([
      { data: { lead_id: null, expires_at: null } }, // flow_links -> kein lead
    ])
    const r = await speichereReparaturWunschterminFlow('no-lead-token', '2026-07-10T10:00')
    expect(r.ok).toBe(false)
    expect(updateCalls).toHaveLength(0)
  })

  it('ruft leads.update mit reparatur_wunschtermin (UTC) auf und gibt ok:true zurueck', async () => {
    primeResponses([
      flowLinkFound('lead-42'),       // flow_links-Lookup
      { data: null, error: null },     // leads.update().eq() terminal
    ])
    const r = await speichereReparaturWunschterminFlow('my-token', '2026-06-03T10:00')
    expect(r.ok).toBe(true)
    // Die gespeicherte Zeit muss als UTC-ISO vorliegen (Berlin CEST = +2h -> 08:00Z).
    expect(updateCalls).toHaveLength(1)
    const upd = updateCalls[0] as Record<string, unknown>
    expect(upd).toHaveProperty('reparatur_wunschtermin')
    expect(upd.reparatur_wunschtermin).toBe('2026-06-03T08:00:00.000Z')
  })

  it('gibt ok:false wenn leads.update einen DB-Fehler liefert', async () => {
    primeResponses([
      flowLinkFound('lead-42'),
      { data: null, error: { message: 'DB-Fehler beim Update' } },
    ])
    const r = await speichereReparaturWunschterminFlow('my-token', '2026-06-03T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('DB-Fehler beim Update')
  })

  it('gibt ok:false bei ungueltigem Wunschtermin-String', async () => {
    primeResponses([
      flowLinkFound('lead-42'),
    ])
    const r = await speichereReparaturWunschterminFlow('my-token', 'kein-datum')
    // resolveWunschterminIso gibt null zurueck -> ok:false
    expect(r.ok).toBe(false)
    expect(updateCalls).toHaveLength(0)
  })
})
