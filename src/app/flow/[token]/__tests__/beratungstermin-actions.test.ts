// Task 2: Unit-Tests fuer die drei Beratungstermin-Actions (AAR-956 Auto-Beratungstermin).
//
// Mock-Strategie: queue-basierter Supabase-Admin-Builder (idiom: convert-lead-to-claim.test.ts).
// Jede terminale Operation (maybeSingle / awaited .eq()-Kette) dequeued die naechste Response.
// Das ist robuster als vi.fn().mockReturnValueOnce-Chaining, weil es keine Reihenfolge-Fallen
// bei wiederholten Methoden-Aufrufen hat.

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

// These modules are imported by self-service-actions.ts but are NOT exercised
// by the three Beratungstermin actions — mock them as no-ops to avoid import errors.
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

// ─── Import (after mocks) ────────────────────────────────────────────────────

import {
  ladeBeratungsterminFlow,
  bestaetigeBeratungsterminFlow,
  verschiebeBeratungsterminFlow,
} from '../self-service-actions'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** flow_links-Lookup-Response: Token gefunden -> lead_id zurueckgeben */
const flowLinkFound = (leadId: string) => ({ data: { lead_id: leadId, expires_at: null } })
/** flow_links-Lookup-Response: Token nicht gefunden (Backward-Compat: Token=leadId) */
const flowLinkNotFound = { data: null }

beforeEach(() => {
  vi.clearAllMocks()
  responseQueue = []
  updateCalls.length = 0
})

// ─── ladeBeratungsterminFlow ─────────────────────────────────────────────────

describe('ladeBeratungsterminFlow', () => {
  it('liefert null wenn kein kb_beratung-Termin existiert', async () => {
    primeResponses([
      flowLinkFound('lead-1'), // resolveFlowLead: flow_links.maybeSingle
      { data: null },          // ladeBeratungsterminFlow: gutachter_termine.maybeSingle
    ])
    const r = await ladeBeratungsterminFlow('tok')
    expect(r).toEqual({ ok: true, termin: null })
  })

  it('liefert Termin + KB-Vorname wenn Termin existiert und assignee_id gesetzt', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: { id: 't1', start_zeit: '2026-06-24T08:00:00Z', status: 'reserviert', assignee_id: 'kb-1' } },
      { data: { vorname: 'Mara' } }, // profiles.maybeSingle fuer KB-Vorname
    ])
    const r = await ladeBeratungsterminFlow('tok')
    expect(r).toMatchObject({
      ok: true,
      termin: { id: 't1', startZeit: '2026-06-24T08:00:00Z', status: 'reserviert', kbVorname: 'Mara' },
    })
  })

  it('liefert kbVorname=null wenn assignee_id fehlt', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: { id: 't2', start_zeit: '2026-06-25T09:00:00Z', status: 'bestaetigt', assignee_id: null } },
      // kein Profile-Lookup (assignee_id ist null)
    ])
    const r = await ladeBeratungsterminFlow('tok')
    if (r.ok) {
      expect(r.termin?.kbVorname).toBeNull()
      expect(r.termin?.id).toBe('t2')
    } else {
      throw new Error(`Erwartet ok:true, aber ok:false mit error=${r.error}`)
    }
  })

  it('gibt ok:false bei leerem Token zurueck', async () => {
    // leerer Token -> resolveFlowLead gibt sofort Fehler (kein DB-Call)
    const r = await ladeBeratungsterminFlow('')
    expect(r.ok).toBe(false)
  })
})

// ─── bestaetigeBeratungsterminFlow ──────────────────────────────────────────

describe('bestaetigeBeratungsterminFlow', () => {
  it('setzt status auf bestaetigt und gibt ok:true zurueck', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: { id: 't1', status: 'reserviert' } }, // ladeAktivenBeratungstermin
      { data: null, error: null },                   // update().eq() terminal
    ])
    const r = await bestaetigeBeratungsterminFlow('tok')
    expect(r.ok).toBe(true)
    expect(updateCalls.at(-1)).toMatchObject({ status: 'bestaetigt' })
  })

  it('gibt ok:false wenn kein aktiver Termin vorhanden', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: null }, // ladeAktivenBeratungstermin: kein Termin
    ])
    const r = await bestaetigeBeratungsterminFlow('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kein Beratungstermin')
  })

  it('gibt ok:false bei leerem Token', async () => {
    // leerer Token -> resolveFlowLead gibt sofort Fehler
    const r = await bestaetigeBeratungsterminFlow('')
    expect(r.ok).toBe(false)
  })

  it('gibt ok:false wenn DB-Update einen Fehler liefert', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: { id: 't1', status: 'reserviert' } },
      { data: null, error: { message: 'DB-Fehler' } }, // update failt
    ])
    const r = await bestaetigeBeratungsterminFlow('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('DB-Fehler')
  })
})

// ─── verschiebeBeratungsterminFlow ──────────────────────────────────────────

describe('verschiebeBeratungsterminFlow', () => {
  it('berechnet end = start + 30min und updatet status=bestaetigt + verlegung_initiator_kunde=true', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: { id: 't1', status: 'reserviert' } }, // ladeAktivenBeratungstermin
      { data: null, error: null },                   // update terminal
    ])
    const neuStart = '2026-06-25T13:00:00.000Z'
    const r = await verschiebeBeratungsterminFlow('tok', neuStart)
    expect(r.ok).toBe(true)

    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd).toMatchObject({
      start_zeit: neuStart,
      status: 'bestaetigt',
      verlegung_initiator_kunde: true,
    })
    // end_zeit = start + 30min
    const diffMs = new Date(upd.end_zeit as string).getTime() - new Date(upd.start_zeit as string).getTime()
    expect(diffMs).toBe(30 * 60 * 1000)
  })

  it('gibt ok:false bei ungueltigem Datums-String', async () => {
    primeResponses([flowLinkFound('lead-1')])
    const r = await verschiebeBeratungsterminFlow('tok', 'kein-datum')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Ungültige Zeit')
  })

  it('gibt ok:false wenn der neue Termin in der Vergangenheit liegt', async () => {
    primeResponses([flowLinkFound('lead-1')])
    const vergangen = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1h in der Vergangenheit
    const r = await verschiebeBeratungsterminFlow('tok', vergangen)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zukunft')
  })

  it('gibt ok:false wenn kein aktiver Termin vorhanden', async () => {
    primeResponses([
      flowLinkFound('lead-1'),
      { data: null }, // kein Termin
    ])
    const zukunft = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const r = await verschiebeBeratungsterminFlow('tok', zukunft)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kein Beratungstermin')
  })

  it('gibt ok:false bei leerem Token', async () => {
    const zukunft = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const r = await verschiebeBeratungsterminFlow('', zukunft)
    expect(r.ok).toBe(false)
  })
})
