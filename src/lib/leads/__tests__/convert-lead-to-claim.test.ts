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
    // T1 (Kunde-Termin-Funnel): uebernehmeLeadTermine nutzt .or() fuer den
    // Dual-Lookup (bezug-nativ + Legacy lead_id) beim gutachter_termine-Update.
    or: (expr: string) => {
      op.filters.push({ method: 'or', args: [expr] })
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
      { data: [] }, // 2b T2 hatOffeneLeadTermine (keine offenen Termine)
      { data: { id: 'claim-1', claim_nummer: 'CLM-1' } }, // 3 claims insert
      { data: { id: 'person-1' } }, // 4 personen insert (geschädigter, account-los)
      { data: null }, // 5 claim_parties insert
      { data: [] }, // 5b T1 uebernehmeLeadTermine (Umhaengen der offenen Termine)
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
      { data: [] }, // 2b T2 hatOffeneLeadTermine
      { data: { id: 'claim-rw', claim_nummer: 'CLM-RW' } }, // 3 claims insert
      { data: { id: 'person-2' } }, // 4 personen insert (geschädigter)
      { data: null }, // 5 claim_parties insert
      { data: [] }, // 5b T1 uebernehmeLeadTermine
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
      { data: [] }, // T2 hatOffeneLeadTermine
      { data: { id: 'claim-norw', claim_nummer: 'CLM-NORW' } },
      { data: { id: 'person-3' } },
      { data: null }, // claim_parties insert
      { data: [] }, // T1 uebernehmeLeadTermine
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

  it('propagiert reparaturwunsch + vermittlung_status + extern + freie_werkstattwahl vom Lead auf den Claim-Insert', async () => {
    primeResponses([
      { data: { id: 'lead-rwu', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster',
                reparaturwunsch: 'reparatur', reparatur_vermittlung_status: 'eigene', reparatur_werkstatt_extern: 'Karosserie Müller',
                freie_werkstattwahl: true } },
      { data: [] },
      { data: [] }, // T2 hatOffeneLeadTermine
      { data: { id: 'claim-rwu', claim_nummer: 'CLM-RWU' } },
      { data: { id: 'person-9' } },
      { data: null }, // claim_parties insert
      { data: [] }, // T1 uebernehmeLeadTermine
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
    // convert-lead-claim-audit: freie_werkstattwahl Lead -> Claim (Trigger respektiert es)
    expect(payload.freie_werkstattwahl).toBe(true)
  })

  it('setzt reparaturwunsch=null + vermittlung_status default offen wenn der Lead keinen hat', async () => {
    primeResponses([
      { data: { id: 'lead-def', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } },
      { data: [] },
      { data: [] }, // T2 hatOffeneLeadTermine
      { data: { id: 'claim-def', claim_nummer: 'CLM-DEF' } },
      { data: { id: 'person-10' } },
      { data: null }, // claim_parties insert
      { data: [] }, // T1 uebernehmeLeadTermine
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
    expect(payload.freie_werkstattwahl).toBeNull()
  })

  // ─── SP2 Task 4: reparatur_termine-Insert bei Conversion ─────────────────

  it('SP2 T4: legt reparatur_termine-Zeile (status=angefragt) an wenn Lead reparatur_werkstatt_id + reparatur_wunschtermin hat', async () => {
    // Sequence:
    //  1 leads select (load + Idempotenz)
    //  2 profiles select (KB Round-Robin -> leer -> null)
    //  3 T2 hatOffeneLeadTermine
    //  4 claims insert
    //  5 personen insert (geschaedigter, account-los)
    //  6 claim_parties insert
    //  7 T1 uebernehmeLeadTermine (Umhaengen)
    //  8 reparatur_termine insert  <-- SP2-T4-Insert
    //  9 faelle_claim_bridge upsert
    // 10 leads update
    primeResponses([
      {
        data: {
          id: 'lead-rt',
          schadens_art: 'haftpflicht',
          gegner_bekannt: false,
          vorname: 'Max',
          nachname: 'Muster',
          reparatur_werkstatt_id: 'werkstatt-rt-1',
          reparatur_wunschtermin: '2026-07-10T08:00:00.000Z',
        },
      }, // 1 leads select
      { data: [] },                                              // 2 profiles select
      { data: [] },                                              // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-rt', claim_nummer: 'CLM-RT' } },    // 4 claims insert
      { data: { id: 'person-rt' } },                            // 5 personen insert
      { data: null },                                            // 6 claim_parties insert
      { data: [] },                                              // 7 T1 uebernehmeLeadTermine
      { data: null },                                            // 8 reparatur_termine insert
      { data: null },                                            // 9 faelle_claim_bridge upsert
      { data: null },                                            // 10 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-rt', triggerByUserId: 'user-dispatcher' })
    expect(r.ok).toBe(true)

    // reparatur_termine-Insert muss abgesetzt worden sein
    const rtInsert = operations.find((o) => o.table === 'reparatur_termine' && o.op === 'insert')
    expect(rtInsert).toBeTruthy()
    const rtPayload = rtInsert!.payload as Record<string, unknown>
    expect(rtPayload.claim_id).toBe('claim-rt')
    expect(rtPayload.werkstatt_id).toBe('werkstatt-rt-1')
    expect(rtPayload.wunschtermin).toBe('2026-07-10T08:00:00.000Z')
    expect(rtPayload.status).toBe('angefragt')
    expect(rtPayload.erstellt_von).toBe('user-dispatcher')
  })

  it('SP2 T4 (#4364): legt die reparatur_termine-Zeile AUCH ohne Wunschtermin an (wunschtermin=null)', async () => {
    // Audit-Fund b1 "toter Reparatur-Auftrag": frueher war die Row an BEIDE Felder gekoppelt
    // (werkstatt_id UND wunschtermin). Der Wunschtermin ist im Flow aber OPTIONAL -> ohne ihn
    // entstand keine Row, und WerkstattAuftragDetail blendete die GANZE Termin-Sektion aus,
    // inkl. des Buttons, mit dem die Werkstatt selbst haette vorschlagen koennen.
    // Seit Mig 20260715005517 ist wunschtermin nullable und die Row entsteht immer, sobald
    // eine Werkstatt gewaehlt ist. Dieser Test hielt bis 19.07. noch das ALTE Verhalten fest.
    primeResponses([
      {
        data: {
          id: 'lead-no-rt',
          schadens_art: 'haftpflicht',
          gegner_bekannt: false,
          vorname: 'Max',
          nachname: 'Muster',
          reparatur_werkstatt_id: 'werkstatt-rt-2',
          // reparatur_wunschtermin absichtlich nicht gesetzt
        },
      }, // 1 leads select
      { data: [] },                                                // 2 profiles select
      { data: [] },                                                // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-no-rt', claim_nummer: 'CLM-NO-RT' } }, // 4 claims insert
      { data: { id: 'person-nrt' } },                              // 5 personen insert
      { data: null },                                              // 6 claim_parties insert
      { data: [] },                                                // 7 T1 uebernehmeLeadTermine
      { data: null },                                              // 8 reparatur_termine insert (auch ohne Wunschtermin)
      { data: null },                                              // 9 faelle_claim_bridge upsert
      { data: null },                                              // 10 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-no-rt' })
    expect(r.ok).toBe(true)

    const rtInsert = operations.find((o) => o.table === 'reparatur_termine' && o.op === 'insert')
    expect(rtInsert).toBeTruthy()
    const rtPayload = rtInsert!.payload as Record<string, unknown>
    expect(rtPayload.werkstatt_id).toBe('werkstatt-rt-2')
    expect(rtPayload.wunschtermin).toBeNull()
    expect(rtPayload.status).toBe('angefragt')
  })

  // ─── KB-Skip fuer Selbstzahler (Aaron 06.07.) ────────────────────────────
  it('KB-Skip: Selbstzahler-Lead bekommt KEINEN Kundenbetreuer (Round-Robin uebersprungen)', async () => {
    // abrechnungsweg='selbstzahler' -> reiner Reparatur-Vorgang ohne SV/Regulierung
    // -> kein KB (analog embed-B). Der KB-Round-Robin (profiles-Select) faellt weg.
    // Aber T2 hatOffeneLeadTermine laeuft trotzdem (vor dem claims-Insert).
    primeResponses([
      { data: { id: 'lead-sz', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'selbstzahler' } }, // 1 leads select
      { data: [] },                                          // 2 T2 hatOffeneLeadTermine (KEIN profiles-Select davor)
      { data: { id: 'claim-sz', claim_nummer: 'CLM-SZ' } }, // 3 claims insert
      { data: { id: 'person-sz' } },                         // 4 personen insert
      { data: null },                                        // 5 claim_parties insert
      { data: [] },                                          // 6 T1 uebernehmeLeadTermine
      { data: null },                                        // 7 faelle_claim_bridge upsert
      { data: null },                                        // 8 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-sz' })
    expect(r.ok).toBe(true)

    // Round-Robin uebersprungen -> gar kein profiles-Select.
    expect(operations.filter((o) => o.table === 'profiles')).toHaveLength(0)

    // claims-Insert traegt kundenbetreuer_id = null + abrechnungsweg durchgereicht.
    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.kundenbetreuer_id).toBeNull()
    expect(payload.abrechnungsweg).toBe('selbstzahler')
    if (r.ok) expect(r.kundenbetreuerId).toBeNull()
  })

  it('KB-Skip: Nicht-Selbstzahler (haftpflicht) durchlaeuft den KB-Round-Robin weiterhin', async () => {
    // Kontrast/Regressions-Guard: ohne abrechnungsweg='selbstzahler' MUSS das
    // profiles-Select (Round-Robin) wie gehabt laufen. Leerer Betreuer-Pool ->
    // KB null, aber der Select findet statt.
    primeResponses([
      { data: { id: 'lead-hp', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } }, // 1 leads select
      { data: [] },                                          // 2 profiles select (Round-Robin -> leer)
      { data: [] },                                          // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-hp', claim_nummer: 'CLM-HP' } }, // 4 claims insert
      { data: { id: 'person-hp' } },                         // 5 personen insert
      { data: null },                                        // 6 claim_parties insert
      { data: [] },                                          // 7 T1 uebernehmeLeadTermine
      { data: null },                                        // 8 faelle_claim_bridge upsert
      { data: null },                                        // 9 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-hp' })
    expect(r.ok).toBe(true)

    // Round-Robin lief -> mindestens ein profiles-Select.
    expect(operations.filter((o) => o.table === 'profiles').length).toBeGreaterThanOrEqual(1)
  })

  // ─── Audit-Bug F (Kasko-Audit 15.07.) ─────────────────────────────────────
  // Der Werkstatt-Reparatur-Weg (kasko/selbstzahler) hat KEIN SV-Onboarding: der Claim
  // wird im FlowLink erfasst, es gibt weder Gutachter-Termin noch Vollmacht-Strecke.
  // onboarding_complete blieb bisher auf dem DB-Default false -> der Kunde wurde vom
  // Portal-Gate (kunde/layout.tsx, kunde/page.tsx) in einen Wizard gezwungen, der fuer
  // ihn auf welcome->fall->fertig zusammenschrumpft, und sah eine "Onboarding
  // abschliessen"-Warnkarte (lib/kunde/jetzt-zu-tun.ts). Bei der Konversion direkt auf
  // true setzen. NICHT lifecycle-relevant: lifecycle.ts liest das Feld nicht.
  it('Bug F: Kasko-Lead -> Claim wird mit onboarding_complete=true angelegt', async () => {
    primeResponses([
      { data: { id: 'lead-ka', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'kasko' } }, // 1 leads select
      { data: [] },                                          // 2 T2 hatOffeneLeadTermine (KB-Skip -> kein profiles-Select)
      { data: { id: 'claim-ka', claim_nummer: 'CLM-KA' } }, // 3 claims insert
      { data: { id: 'person-ka' } },                        // 4 personen insert
      { data: null },                                       // 5 claim_parties insert
      { data: [] },                                         // 6 T1 uebernehmeLeadTermine
      { data: null },                                       // 7 faelle_claim_bridge upsert
      { data: null },                                       // 6 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-ka' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.onboarding_complete).toBe(true)
  })

  it('Bug F: Selbstzahler-Lead -> Claim wird mit onboarding_complete=true angelegt', async () => {
    primeResponses([
      { data: { id: 'lead-sz2', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'selbstzahler' } }, // 1 leads select
      { data: [] },                                          // 2 T2 hatOffeneLeadTermine (KB-Skip)
      { data: { id: 'claim-sz2', claim_nummer: 'CLM-SZ2' } }, // 3 claims insert
      { data: { id: 'person-sz2' } },                         // 4 personen insert
      { data: null },                                         // 5 claim_parties insert
      { data: [] },                                           // 6 T1 uebernehmeLeadTermine
      { data: null },                                         // 7 faelle_claim_bridge upsert
      { data: null },                                         // 8 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-sz2' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.onboarding_complete).toBe(true)
  })

  it('Bug F: Haftpflicht-Lead behaelt das echte SV-Onboarding (onboarding_complete NICHT gesetzt)', async () => {
    // Regressions-Guard: der Haftpflicht-Kunde MUSS weiterhin durchs Onboarding
    // (Vollmacht, SV-Termin) -> das Flag bleibt beim DB-Default false.
    primeResponses([
      { data: { id: 'lead-hp2', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'haftpflicht' } }, // 1 leads select
      { data: [] },                                           // 2 profiles select (Round-Robin)
      { data: [] },                                           // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-hp2', claim_nummer: 'CLM-HP2' } }, // 4 claims insert
      { data: { id: 'person-hp2' } },                         // 5 personen insert
      { data: null },                                         // 6 claim_parties insert
      { data: [] },                                           // 7 T1 uebernehmeLeadTermine
      { data: null },                                         // 8 faelle_claim_bridge upsert
      { data: null },                                         // 9 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-hp2' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.onboarding_complete).toBeUndefined()
  })
})

// ─── #8 Vermittler-SSoT Phase 2 ──────────────────────────────────────────────
// Genau EIN Vermittler (INBOUND) pro Claim => genau EINE Provision.
// Praezedenz: makler > werkstatt-inbound > firmen_flotte. Der Flotten-Lookup laeuft NUR,
// wenn weder makler noch werkstatt greifen UND ein Fahrzeug am Claim haengt (kein
// ueberfluessiger Roundtrip — und damit auch kein Response-Queue-Shift in den Alt-Tests).

describe('convertLeadToClaim — #8 Vermittler-SSoT', () => {
  it('Makler-Vermittlung (promotion_code) -> vermittler_typ=makler', async () => {
    primeResponses([
      { data: { id: 'lead-mk', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', promotion_code_id: 'promo-1' } }, // 1 leads select
      { data: [] },                                                    // 2 profiles select
      { data: [] },                                                    // 3 T2 hatOffeneLeadTermine
      { data: { makler_id: 'makler-1', code: 'MK1' } },               // 4 promotion_codes select
      { data: { id: 'claim-mk', claim_nummer: 'CLM-MK' } },           // 5 claims insert
      { data: { id: 'person-mk' } },                                   // 6 personen insert
      { data: null },                                                  // 7 claim_parties insert
      { data: [] },                                                    // 8 T1 uebernehmeLeadTermine
      { data: null },                                                  // 9 faelle_claim_bridge upsert
      { data: null },                                                  // 10 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-mk' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.makler_id).toBe('makler-1')
    expect(payload.vermittler_typ).toBe('makler')
    expect(payload.vermittler_id).toBe('makler-1')
    // Makler greift -> kein Flotten-Lookup.
    expect(operations.filter((o) => o.table === 'flotten_fahrzeuge')).toHaveLength(0)
  })

  it('Werkstatt-Vermittlung (QR/inbound) -> vermittler_typ=werkstatt', async () => {
    primeResponses([
      { data: { id: 'lead-wk', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', werkstatt_id: 'werkstatt-inbound-1' } }, // 1 leads select
      { data: [] },                                                    // 2 profiles select
      { data: [] },                                                    // 3 T2 hatOffeneLeadTermine
      { data: { user_id: 'profil-werkstatt-1' } },                    // 4 werkstaetten select (netzwerk_owner_id-Resolver, P3-Seed)
      { data: { id: 'claim-wk', claim_nummer: 'CLM-WK' } },           // 5 claims insert
      { data: { id: 'person-wk' } },                                   // 6 personen insert
      { data: null },                                                  // 7 claim_parties insert
      { data: [] },                                                    // 8 T1 uebernehmeLeadTermine
      { data: null },                                                  // 9 faelle_claim_bridge upsert
      { data: null },                                                  // 10 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-wk' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.werkstatt_id).toBe('werkstatt-inbound-1')
    expect(payload.vermittler_typ).toBe('werkstatt')
    expect(payload.vermittler_id).toBe('werkstatt-inbound-1')
    // P3-Seed: claims.netzwerk_owner_id aus dem INBOUND-Vermittler (werkstaetten.user_id).
    expect(payload.netzwerk_owner_id).toBe('profil-werkstatt-1')
    expect(operations.filter((o) => o.table === 'flotten_fahrzeuge')).toHaveLength(0)
  })

  it('MONEY-Guard: makler UND werkstatt am Lead -> nur EIN Vermittler (makler gewinnt)', async () => {
    // Genau dieser Fall erzeugt heute (ungegatet) ZWEI Provisionen — der partial-unique-Index
    // (partner_typ, claim_id) verhindert nur Doubletten DESSELBEN Typs. Der SSoT-Wert ist das,
    // worauf die drei Trigger-Gates ihn auf EINE Provision reduzieren.
    primeResponses([
      { data: { id: 'lead-both', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', promotion_code_id: 'promo-2', werkstatt_id: 'werkstatt-inbound-2' } }, // 1 leads select
      { data: [] },                                                    // 2 profiles select
      { data: [] },                                                    // 3 T2 hatOffeneLeadTermine
      { data: { makler_id: 'makler-2', code: 'MK2' } },               // 4 promotion_codes select
      { data: { id: 'claim-both', claim_nummer: 'CLM-BOTH' } },       // 5 claims insert
      { data: { id: 'person-both' } },                                 // 6 personen insert
      { data: null },                                                  // 7 claim_parties insert
      { data: [] },                                                    // 8 T1 uebernehmeLeadTermine
      { data: null },                                                  // 9 faelle_claim_bridge upsert
      { data: null },                                                  // 10 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-both' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    // Beide Roh-Signale bleiben am Claim (Historie/Consent), aber der Vermittler ist EINDEUTIG.
    expect(payload.makler_id).toBe('makler-2')
    expect(payload.werkstatt_id).toBe('werkstatt-inbound-2')
    expect(payload.vermittler_typ).toBe('makler')
    expect(payload.vermittler_id).toBe('makler-2')
  })

  it('Firmen-Flotte (Fahrzeug in aktiver Flotte) -> vermittler_typ=firmen_flotte', async () => {
    // lead.vehicle_id gesetzt -> resolvedVehicleId ohne DB-Call. Kein makler/werkstatt
    // -> Flotten-Lookup laeuft (spiegelt den Join in create_firmen_flotte_provision).
    primeResponses([
      { data: { id: 'lead-ff', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', vehicle_id: 'veh-ff-1' } }, // 1 leads select
      { data: [] },                                                    // 2 profiles select
      { data: [] },                                                    // 3 T2 hatOffeneLeadTermine
      { data: [{ firma_id: 'firma-1' }] },                            // 4 flotten_fahrzeuge select
      { data: { id: 'konto-1' } },                                     // 5 firmen_flotten_konten select (Vermittler-Aufloesung)
      { data: { user_id: 'profil-flotte-1' } },                       // 6 firmen_flotten_konten select (netzwerk_owner_id-Resolver, P3-Seed)
      { data: { id: 'claim-ff', claim_nummer: 'CLM-FF' } },           // 7 claims insert
      { data: { id: 'person-ff' } },                                   // 8 personen insert
      { data: null },                                                  // 9 claim_parties insert
      { data: [] },                                                    // 10 T1 uebernehmeLeadTermine
      { data: null },                                                  // 11 (ggf. claim_vehicle_involvements)
      { data: null },                                                  // 12 faelle_claim_bridge upsert
      { data: null },                                                  // 13 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-ff' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.vehicle_id).toBe('veh-ff-1')
    expect(payload.vermittler_typ).toBe('firmen_flotte')
    expect(payload.vermittler_id).toBe('konto-1')
    // P3-Seed: claims.netzwerk_owner_id aus dem INBOUND-Vermittler (firmen_flotten_konten.user_id).
    expect(payload.netzwerk_owner_id).toBe('profil-flotte-1')
  })

  it('kein Vermittler -> vermittler_typ=null (und KEIN Flotten-Lookup ohne Fahrzeug)', async () => {
    primeResponses([
      { data: { id: 'lead-nov', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } }, // 1 leads select
      { data: [] },                                                    // 2 profiles select
      { data: [] },                                                    // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-nov', claim_nummer: 'CLM-NOV' } },         // 4 claims insert
      { data: { id: 'person-nov' } },                                  // 5 personen insert
      { data: null },                                                  // 6 claim_parties insert
      { data: [] },                                                    // 7 T1 uebernehmeLeadTermine
      { data: null },                                                  // 8 faelle_claim_bridge upsert
      { data: null },                                                  // 9 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-nov' })
    expect(r.ok).toBe(true)

    const payload = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(payload.vermittler_typ).toBeNull()
    expect(payload.vermittler_id).toBeNull()
    // Ohne Fahrzeug kein Flotten-Roundtrip (und damit kein Queue-Shift in den Alt-Tests).
    expect(operations.filter((o) => o.table === 'flotten_fahrzeuge')).toHaveLength(0)
  })
})

// ─── P4 (Netzwerk): SV-Vermittlungs-Sofort-Claim ────────────────────────────
describe('convertLeadToClaim — gutachtenBereitsErstellt (P4 Sofort-Claim)', () => {
  it('SV-Vermittlung: gutachtenBereitsErstellt -> operative_status=gutachten-eingegangen, sv_id gesetzt, onboarding_complete ungesetzt', async () => {
    primeResponses([
      { data: { id: 'lead-sv', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'haftpflicht' } }, // 1 leads select
      { data: [] },                                                // 2 profiles select (KB Round-Robin)
      { data: [] },                                                // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-sv', claim_nummer: 'CLM-SV' } },        // 4 claims insert
      { data: { id: 'person-sv' } },                               // 5 personen insert
      { data: null },                                              // 6 claim_parties insert
      { data: [] },                                                // 7 T1 uebernehmeLeadTermine
      { data: null },                                              // 8 faelle_claim_bridge upsert
      { data: null },                                              // 9 leads update
    ])
    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-sv', svIdFromTermin: 'sv-1', gutachtenBereitsErstellt: true })
    expect(r.ok).toBe(true)
    const p = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(p.operative_status).toBe('gutachten-eingegangen')
    expect(p.sv_id).toBe('sv-1')
    expect(p.onboarding_complete).toBeUndefined() // Haftpflicht -> kein Reduced-Repair-Zweig
  })

  it('ohne gutachtenBereitsErstellt: Initial-State unveraendert (sv-termin bei svIdFromTermin)', async () => {
    primeResponses([
      { data: { id: 'lead-alt', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } },
      { data: [] },
      { data: [] }, // T2 hatOffeneLeadTermine
      { data: { id: 'claim-alt', claim_nummer: 'CLM-ALT' } },
      { data: { id: 'person-alt' } },
      { data: null }, // claim_parties insert
      { data: [] }, // T1 uebernehmeLeadTermine
      { data: null },
      { data: null },
    ])
    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-alt', svIdFromTermin: 'sv-1' })
    expect(r.ok).toBe(true)
    const p = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
    expect(p.operative_status).toBe('sv-termin')
  })
})

// ─── Kunde-Termin-Funnel T1: Fail-Injection (Review) ────────────────────────
// Beweist die Non-Fatal-Invariante des T1-Blocks: ein echter Fehler beim
// gutachter_termine-Update (uebernehmeLeadTermine, das .or()-Chain-Update) darf die
// Konversion NICHT abbrechen — nur lautes console.error-Logging, kein cleanupAndFail.
describe('convertLeadToClaim — T1 Fail-Injection', () => {
  it('gutachter_termine-Update-Fehler in uebernehmeLeadTermine ist non-fatal (Konversion bleibt ok:true)', async () => {
    primeResponses([
      { data: { id: 'lead-t1err', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster' } }, // 1 leads select
      { data: [] },                                                     // 2 profiles select
      { data: [] },                                                     // 3 T2 hatOffeneLeadTermine
      { data: { id: 'claim-t1err', claim_nummer: 'CLM-T1ERR' } },      // 4 claims insert
      { data: { id: 'person-t1err' } },                                 // 5 personen insert
      { data: null },                                                   // 6 claim_parties insert
      { data: null, error: { message: 'kaputt' } },                     // 7 T1 uebernehmeLeadTermine -> FEHLER
      { data: null },                                                   // 8 faelle_claim_bridge upsert
      { data: null },                                                   // 9 leads update
    ])

    const { convertLeadToClaim } = await import('../convert-lead-to-claim')
    const r = await convertLeadToClaim({ leadId: 'lead-t1err' })

    expect(r.ok).toBe(true)
    // Beweist, dass der Fehler tatsaechlich den T1-Update-Call traf (kein ungenutzter Queue-Slot).
    const terminUpdate = operations.find((o) => o.table === 'gutachter_termine' && o.op === 'update')
    expect(terminUpdate).toBeTruthy()
  })
})
