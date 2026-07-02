// CMM-3 (Phase 0.5): Smoke-Tests für convertLeadToClaim.
//
// Wir mocken den Admin-Client komplett und prüfen, dass die Funktion:
//   1. Idempotenz-Check liest leads.konvertiert_zu_claim_id
//   2. Bei schon-konvertiertem Lead {idempotent: true} zurückgibt
//   3. Bei neuem Lead die richtigen Inserts in claims/claim_parties/
//      claim_vehicle_involvements/faelle absetzt
//   4. Den Lead-Tag (lead_id, created_via) auf den Claim setzt
//   5. Bei Verursacher-bekannt eine zweite party anlegt
//   6. CMM-entity P3: person_id auf die claim_parties durchläuft
//
// Echte DB-Tests gibt es in Phase 7 (RLS-Test-Suite).
//
// Mock-Harness: queue-basiert. Jede terminale Operation (single/maybeSingle/
// awaited-chain) dequeued die naechste Response in Aufruf-Reihenfolge.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ─────────────────────────────────────────────────────────────
// Wir bauen ein Spy-Objekt, das die Supabase-Builder-Chain simuliert.
type Operation = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
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
    single: () => Promise.resolve(nextResponse()),
    maybeSingle: () => Promise.resolve(nextResponse()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResponse()).then(resolve),
  }
  return handler
}

let responseQueue: Array<{ data: unknown; error: unknown; count?: number }> = []

function nextResponse(): { data: unknown; error: unknown; count?: number } {
  return responseQueue.shift() ?? { data: null, error: null }
}

/** Setzt eine einzelne Response (fuer Tests mit genau einem terminalen Call). */
function setResponse(r: { data: unknown; error?: unknown; count?: number }) {
  responseQueue = [{ data: r.data, error: r.error ?? null, count: r.count }]
}

/** Setzt eine Response-Sequenz in Aufruf-Reihenfolge (Happy-Path). */
function primeResponses(rs: Array<{ data: unknown; error?: unknown; count?: number }>) {
  responseQueue = rs.map((r) => ({ data: r.data, error: r.error ?? null, count: r.count }))
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
      // CMM-49: faelle_claim_bridge wird via upsert geschrieben (claim-first converter).
      upsert: (payload: unknown) => {
        const op: Operation = { table, op: 'upsert', payload, filters: [] }
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

beforeEach(() => {
  resetMocks()
  responseQueue = []
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

  it('CMM-entity P3: setzt person_id auf die geschädigter-claim_party', async () => {
    // Lead ohne FIN (kein vehicle-Pfad), ohne Gegner-Info (nur 1 Party),
    // ohne Account (kunde_id null) -> ensurePersonForData(userId:null) legt
    // genau EINE personen-Row an und der Loop haengt person_id an die Party.
    primeResponses([
      { data: { id: 'lead-1', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } }, // 1 leads select (load + Idempotenz)
      { data: [] }, // 2 profiles select (KB Round-Robin -> keine -> null)
      { data: { id: 'claim-1', claim_nummer: 'CLM-1' } }, // 3 claims insert
      { data: { id: 'person-1' } }, // 4 personen insert (geschädigter, account-los)
      { data: null }, // 5 claim_parties insert
      { data: { id: 'fall-1' } }, // 6 faelle insert
      { data: null }, // 7 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-1' })

    expect(r.ok).toBe(true)

    // Es entstand genau eine personen-Row (account-los, kein Auto-Merge).
    const personenInserts = operations.filter((o) => o.table === 'personen' && o.op === 'insert')
    expect(personenInserts).toHaveLength(1)

    // person_id landet auf der geschädigter-Party im claim_parties-Insert.
    const cpInsert = operations.find((o) => o.table === 'claim_parties' && o.op === 'insert')
    expect(cpInsert).toBeTruthy()
    const parties = cpInsert!.payload as Array<{ rolle: string; person_id?: string | null }>
    const geschaedigter = parties.find((p) => p.rolle === 'geschaedigter')
    expect(geschaedigter?.person_id).toBe('person-1')
  })

  it('Task 6: propagiert reparatur_werkstatt_* vom Lead auf den Claim-Insert', async () => {
    primeResponses([
      {
        data: {
          id: 'lead-rw',
          schadens_art: 'haftpflicht',
          gegner_bekannt: false,
          vorname: 'Max',
          nachname: 'Muster',
          // Dispatcher-Werkstatt-Zuweisung am Lead:
          reparatur_werkstatt_id: 'werkstatt-7',
          reparatur_werkstatt_zugewiesen_am: '2026-06-29T08:00:00.000Z',
          reparatur_werkstatt_zugewiesen_von: 'dispatcher-1',
          reparatur_werkstatt_quelle: 'dispatcher',
        },
      }, // 1 leads select (load + Idempotenz)
      { data: [] }, // 2 profiles select (KB Round-Robin -> keine -> null)
      { data: { id: 'claim-rw', claim_nummer: 'CLM-RW' } }, // 3 claims insert
      { data: { id: 'person-2' } }, // 4 personen insert (geschädigter)
      { data: null }, // 5 claim_parties insert
      { data: null }, // 6 faelle_claim_bridge upsert
      { data: null }, // 7 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-rw' })
    expect(r.ok).toBe(true)

    const claimInsert = operations.find((o) => o.table === 'claims' && o.op === 'insert')
    expect(claimInsert).toBeTruthy()
    const payload = claimInsert!.payload as Record<string, unknown>
    expect(payload.reparatur_werkstatt_id).toBe('werkstatt-7')
    expect(payload.reparatur_werkstatt_zugewiesen_am).toBe('2026-06-29T08:00:00.000Z')
    expect(payload.reparatur_werkstatt_zugewiesen_von).toBe('dispatcher-1')
    expect(payload.reparatur_werkstatt_quelle).toBe('dispatcher')
  })

  it('Task 6: setzt reparatur_werkstatt_* auf null wenn der Lead keine Werkstatt hat', async () => {
    primeResponses([
      { data: { id: 'lead-norw', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } },
      { data: [] },
      { data: { id: 'claim-norw', claim_nummer: 'CLM-NORW' } },
      { data: { id: 'person-3' } },
      { data: null },
      { data: null },
      { data: null },
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-norw' })
    expect(r.ok).toBe(true)

    const claimInsert = operations.find((o) => o.table === 'claims' && o.op === 'insert')
    const payload = claimInsert!.payload as Record<string, unknown>
    expect(payload.reparatur_werkstatt_id).toBeNull()
    expect(payload.reparatur_werkstatt_quelle).toBeNull()
  })

  it('propagiert reparaturwunsch + vermittlung_status + extern vom Lead auf den Claim-Insert', async () => {
    primeResponses([
      { data: { id: 'lead-rwu', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster',
                reparaturwunsch: 'reparatur', reparatur_vermittlung_status: 'eigene', reparatur_werkstatt_extern: 'Karosserie Müller' } },
      { data: [] },
      { data: { id: 'claim-rwu', claim_nummer: 'CLM-RWU' } },
      { data: { id: 'person-9' } },
      { data: null },
      { data: null },
      { data: null },
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-rwu' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.reparaturwunsch).toBe('reparatur')
    expect(payload.reparatur_vermittlung_status).toBe('eigene')
    expect(payload.reparatur_werkstatt_extern).toBe('Karosserie Müller')
  })

  it('setzt reparaturwunsch=null + vermittlung_status default offen wenn der Lead keinen hat', async () => {
    primeResponses([
      { data: { id: 'lead-def', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } },
      { data: [] },
      { data: { id: 'claim-def', claim_nummer: 'CLM-DEF' } },
      { data: { id: 'person-10' } },
      { data: null },
      { data: null },
      { data: null },
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-def' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.reparaturwunsch).toBeNull()
    expect(payload.reparatur_vermittlung_status).toBe('offen')
    expect(payload.reparatur_werkstatt_extern).toBeNull()
  })
})
