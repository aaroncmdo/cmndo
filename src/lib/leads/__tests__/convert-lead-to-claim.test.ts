// CMM-3 (Phase 0.5): Smoke-Tests für convertLeadToClaim.
//
// Wir mocken den Admin-Client komplett und prüfen, dass die Funktion:
//   1. Idempotenz-Check liest leads.konvertiert_zu_claim_id
//   2. Bei schon-konvertiertem Lead {idempotent: true} zurückgibt
//   3. Bei neuem Lead die richtigen Inserts in claims/claim_parties/
//      claim_vehicle_involvements/faelle absetzt
//   4. Den Lead-Tag (lead_id, created_via) auf den Claim setzt
//   5. Bei Verursacher-bekannt eine zweite party anlegt
//   6. Bei Cleanup nach faelle-Insert-Fail den Claim wieder löscht
//
// Echte DB-Tests gibt es in Phase 7 (RLS-Test-Suite).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ─────────────────────────────────────────────────────────────
// Wir bauen ein Spy-Objekt, das die Supabase-Builder-Chain simuliert.
type Operation = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Array<{ method: string; args: unknown[] }>
}

const operations: Operation[] = []

function makeBuilder(op: Operation) {
  const handler = {
    eq: (col: string, val: unknown) => {
      op.filters.push({ method: 'eq', args: [col, val] })
      return handler
    },
    in: (col: string, vals: unknown[]) => {
      op.filters.push({ method: 'in', args: [col, vals] })
      return handler
    },
    not: (...args: unknown[]) => {
      op.filters.push({ method: 'not', args })
      return handler
    },
    like: (col: string, pattern: string) => {
      op.filters.push({ method: 'like', args: [col, pattern] })
      return handler
    },
    limit: (n: number) => {
      op.filters.push({ method: 'limit', args: [n] })
      return handler
    },
    order: (col: string, opts: unknown) => {
      op.filters.push({ method: 'order', args: [col, opts] })
      return handler
    },
    select: (cols: string, opts?: { count?: string; head?: boolean }) => {
      op.filters.push({ method: 'select', args: [cols, opts] })
      return handler
    },
    single: () => Promise.resolve(currentResponse),
    maybeSingle: () => Promise.resolve(currentResponse),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(currentResponse).then(resolve),
  }
  return handler
}

let currentResponse: { data: unknown; error: unknown; count?: number } = {
  data: null,
  error: null,
}

function setResponse(r: { data: unknown; error?: unknown; count?: number }) {
  currentResponse = { data: r.data, error: r.error ?? null, count: r.count }
}

const mockAdmin = {
  from(table: string) {
    return {
      select: (cols: string, opts?: { count?: string; head?: boolean }) => {
        const op: Operation = { table, op: 'select', filters: [] }
        operations.push(op)
        return makeBuilder(op).select(cols, opts)
      },
      insert: (payload: unknown) => {
        const op: Operation = { table, op: 'insert', payload, filters: [] }
        operations.push(op)
        return makeBuilder(op)
      },
      update: (payload: unknown) => {
        const op: Operation = { table, op: 'update', payload, filters: [] }
        operations.push(op)
        return makeBuilder(op)
      },
      delete: () => {
        const op: Operation = { table, op: 'delete', filters: [] }
        operations.push(op)
        return makeBuilder(op)
      },
    }
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}))

// resolveFallEntityFks + buildFallInsertFromLead bleiben echt — Mappings
// sollen real durchlaufen, nur die DB-Calls sind gestoppt.
vi.mock('@/lib/lead-fall-mapping', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/lead-fall-mapping')
  >('@/lib/lead-fall-mapping')
  return {
    ...actual,
    resolveFallEntityFks: vi.fn().mockResolvedValue({
      gegnerVersicherungId: null,
      kanzleiId: null,
      organisationId: null,
      dispatchId: null,
    }),
  }
})

// ─── Helper für Test-Setup ──────────────────────────────────────────────────
function resetMocks() {
  operations.length = 0
}

// Eine Helper-Sequenz für den Happy-Path: setzt die richtigen Responses für
// jeden mockAdmin-Call in convertLeadToClaim.
function primeHappyPathResponses(lead: Record<string, unknown>) {
  // CMM-44 SP-A3: der fall_nummer-Generator (frueher Response 3, faelle count)
  // ist entfernt — claim_nummer kommt vom DB-Trigger und wird aus dem
  // claims-Insert (Response 3) zurueckgelesen.
  const responses = [
    { data: lead, error: null }, // 1. leads select (Idempotenz + load)
    { data: [], error: null, count: 0 }, // 2. profiles select für KB-Lookup
    { data: { id: 'claim-new', claim_nummer: 'CLM-20260427-001' }, error: null }, // 3. claims insert
    { data: null, error: null }, // 4. claim_parties insert
    { data: null, error: null }, // 5. claim_vehicle_involvements insert (only if vehicle_id)
    { data: { id: 'fall-new' }, error: null }, // 6. faelle insert
    { data: null, error: null }, // 7. leads update
  ]
  let i = 0
  Object.defineProperty(currentResponse, 'next', {
    get() {
      return responses[i++]
    },
    configurable: true,
  })
}

beforeEach(() => {
  resetMocks()
  currentResponse = { data: null, error: null }
})

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('convertLeadToClaim', () => {
  it('returns idempotent=true wenn lead.konvertiert_zu_claim_id schon gesetzt ist', async () => {
    setResponse({
      data: {
        id: 'lead-already-converted',
        konvertiert_zu_claim_id: 'claim-existing',
        konvertiert_zu_fall_id: 'fall-existing',
      },
    })

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({
      leadId: 'lead-already-converted',
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.idempotent).toBe(true)
      expect(r.claimId).toBe('claim-existing')
      expect(r.fallId).toBe('fall-existing')
    }
    // Nur ein einziger Read auf leads — keine Inserts.
    expect(operations.filter((o) => o.op === 'insert')).toHaveLength(0)
  })

  it('returns ok:false wenn der Lead nicht gefunden wird', async () => {
    setResponse({ data: null, error: { message: 'not found' } })

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'nope' })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('nicht gefunden')
    }
  })
})
