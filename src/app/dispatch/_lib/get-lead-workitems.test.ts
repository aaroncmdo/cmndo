// Ops-Cockpit Phase 3 — Tests fuer getLeadWorkItems (Loader + Role-Guard + Derivation-Konsum
// + Owner-Namen-Aufloesung). deriveLeadWorkflowState/qualification-engine bleiben ECHT (pure).
// Nur DB + Auth werden gemockt.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'disp-1' } as { id: string } | null,
  rolle: 'dispatch' as string | null,
  rows: [] as Record<string, unknown>[],
  owners: [] as Array<{ id: string; vorname: string | null; nachname: string | null }>,
  dbError: null as { message: string } | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        // Owner-Namen-Aufloesung: .select(...).in('id', ownerIds)
        return { select: () => ({ in: () => Promise.resolve({ data: h.owners, error: null }) }) }
      }
      // v_lead_workstate: .select('*') [.eq(...)] -> thenable + chainable
      return {
        select: () => {
          const result = { data: h.rows, error: h.dbError }
          return {
            eq: () => Promise.resolve(result),
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve(result).then(res, rej),
          }
        },
      }
    },
  }),
}))

import { getLeadWorkItems } from './get-lead-workitems'

function mockSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: h.user ? { rolle: h.rolle } : null }) }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// Ein voll-qualifizierter Lead (alle 8 Gates) — Basis fuer flowlink_senden.
function fullyQualifiedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'lead-fq', zugewiesen_an: 'disp-1', vorname: 'Max', nachname: 'Muster', telefon: '+4915112345678',
    status: null, qualifizierungs_phase: null, disqualifiziert: false, sa_unterschrieben: false,
    rueckruf_geplant_am: null, letzter_anruf_status: null, anruf_versuche: 0,
    // q1..q8 Inputs:
    unfallhergang: 'Auffahrunfall an der Kreuzung mit Blechschaden hinten links.', schuldfrage: 'gegner',
    schaden_sichtbar: true, polizei_vor_ort: true, schadentyp: 'blechschaden',
    gegner_kennzeichen: 'B-XY-123', kennzeichen: 'M-AB-42', fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf',
    fahrzeug_fahrbereit: false,
    termin_status: 'bestaetigt', // Q5
    fl_gesendet_am: null, fl_geoeffnet_am: null, fl_abgeschlossen_am: null, fl_fall_id: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'disp-1' }
  h.rolle = 'dispatch'
  h.rows = []
  h.owners = []
  h.dbError = null
})

describe('getLeadWorkItems — Role-Guard', () => {
  it('kein User -> {ok:false} Nicht angemeldet', async () => {
    h.user = null
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/angemeldet/i)
  })

  it('Fremd-Rolle (kunde) -> {ok:false} Nicht autorisiert (kein adminClient-IDOR)', async () => {
    h.rolle = 'kunde'
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autorisiert/i)
  })

  it('admin darf auch', async () => {
    h.rolle = 'admin'
    h.rows = [fullyQualifiedRow()]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
  })
})

describe('getLeadWorkItems — Derivation + Mapping', () => {
  it('DB-Error -> {ok:false}', async () => {
    h.dbError = { message: 'boom' }
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('boom')
  })

  it('FlowLink gesendet, nicht geoeffnet -> state=nachfassen', async () => {
    h.rows = [fullyQualifiedRow({ fl_gesendet_am: '2026-07-01T10:00:00Z', fl_geoeffnet_am: null })]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.items).toHaveLength(1)
      expect(r.items[0].kind).toBe('lead')
      expect(r.items[0].state).toBe('nachfassen')
      expect(r.items[0].display.title).toBe('Max Muster')
      expect(r.items[0].ownerId).toBe('disp-1')
    }
  })

  it('voll qualifiziert, kein Link -> state=flowlink_senden + qualCompleted=8', async () => {
    h.rows = [fullyQualifiedRow()]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.items[0].state).toBe('flowlink_senden')
      expect(r.items[0].qualCompleted).toBe(8)
    }
  })

  it('title-Fallback auf telefon wenn kein Name', async () => {
    h.rows = [fullyQualifiedRow({ vorname: null, nachname: null, telefon: '+49170' })]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0].display.title).toBe('+49170')
  })

  it('loest Owner-Namen auf (zugewiesen_an -> profiles)', async () => {
    h.rows = [fullyQualifiedRow({ zugewiesen_an: 'disp-1' })]
    h.owners = [{ id: 'disp-1', vorname: 'Dana', nachname: 'Dispatch' }]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0].ownerName).toBe('Dana Dispatch')
  })

  it('kein Owner -> ownerName null', async () => {
    h.rows = [fullyQualifiedRow({ zugewiesen_an: null })]
    const r = await getLeadWorkItems(mockSupabase())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0].ownerName).toBeNull()
  })
})
