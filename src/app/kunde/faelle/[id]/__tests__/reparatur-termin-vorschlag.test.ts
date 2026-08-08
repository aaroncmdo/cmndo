// SP4b Task 2 — Tests fuer schlageReparaturTerminVorPortal.
// Mock-Strategie: Supabase createClient (Kunde-Session, RLS-aware) +
// createServiceClient (Service-Role fuer Werkstatt-user_id-Lookup).
// Die insert-Funktion wird ueber einen Hoisted-Spy erfasst.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted Holders ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  claimData: null as { reparatur_werkstatt_id: string | null } | null,
  // Tranche W (T5): der Aktiv-Check laedt jetzt id+status+wunschtermin.
  aktivData: [] as Array<{ id: string; status?: string; wunschtermin?: string | null }>,
  insertError: null as { message: string } | null,
  werkstattData: null as { user_id: string | null } | null,
  insertSpy: vi.fn().mockResolvedValue({ data: null, error: null }),
  // Tranche W (T5): Service-Client-Nachtrag-Update (angefragt + wunschtermin=null).
  updateSpy: vi.fn(),
  updateResult: { data: [{ id: 'termin-nt' }] as Array<{ id: string }> | null, error: null as { message: string } | null },
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: h.user },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'claims') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: h.claimData, error: null })),
            })),
          })),
        }
      }
      if (table === 'reparatur_termine') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: h.aktivData, error: null })),
              })),
            })),
          })),
          insert: h.insertSpy,
        }
      }
      return {}
    }),
  }),
  createServiceClient: vi.fn(() => ({
    from: vi.fn((_table: string) => ({
      // werkstaetten-Lookup (Notify) UND reparatur_termine-Nachtrag-Update teilen sich
      // dieses table-agnostische from()-Objekt (additiv: bestehende Tests nutzen nur select).
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: h.werkstattData, error: null })),
        })),
      })),
      update: h.updateSpy,
    })),
  })),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: h.createNotification,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ─── Import (after mocks) ────────────────────────────────────────────────────

import { schlageReparaturTerminVorPortal } from '../reparatur-termin-actions'

// ─── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'user-1' }
  h.claimData = { reparatur_werkstatt_id: 'ws-1' }
  h.aktivData = []
  h.insertError = null
  h.werkstattData = { user_id: 'ws-user-1' }
  h.insertSpy.mockResolvedValue({ data: null, error: null })
  h.updateResult = { data: [{ id: 'termin-nt' }], error: null }
  // Nachtrag-Kette: update().eq().eq().is().select() -> h.updateResult
  h.updateSpy.mockReset()
  h.updateSpy.mockImplementation(() => ({
    eq: () => ({ eq: () => ({ is: () => ({ select: async () => h.updateResult }) }) }),
  }))
  h.createNotification.mockResolvedValue(undefined)
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('schlageReparaturTerminVorPortal', () => {
  it('kein User -> ok:false, kein Insert', async () => {
    h.user = null
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.insertSpy).not.toHaveBeenCalled()
  })

  it('Claim ohne reparatur_werkstatt_id -> ok:false, kein Insert', async () => {
    h.claimData = { reparatur_werkstatt_id: null }
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.insertSpy).not.toHaveBeenCalled()
  })

  it('aktiver Termin existiert -> ok:false, kein Insert', async () => {
    h.aktivData = [{ id: 'termin-existing' }]
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.insertSpy).not.toHaveBeenCalled()
  })

  it('Erfolg -> Insert mit status:angefragt + createNotification (Werkstatt-user_id) -> ok:true', async () => {
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(true)

    // Insert muss aufgerufen worden sein
    expect(h.insertSpy).toHaveBeenCalledTimes(1)
    const payload = h.insertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload.status).toBe('angefragt')
    expect(payload.claim_id).toBe('claim-1')
    expect(payload.werkstatt_id).toBe('ws-1')
    expect(typeof payload.wunschtermin).toBe('string')
    expect((payload.wunschtermin as string).length).toBeGreaterThan(0)
    expect(payload.erstellt_von).toBe('user-1')

    // Werkstatt-Notify muss mit der user_id der Werkstatt aufgerufen worden sein
    expect(h.createNotification).toHaveBeenCalledTimes(1)
    expect(h.createNotification.mock.calls[0][0]).toBe('ws-user-1')
  })

  // ─── Tranche W (T5): Kunde-Nachtrag bei ensure-Row (angefragt + wunschtermin=null) ──

  it('Nachtrag: offene angefragt-Row ohne Wunschtermin -> Update statt Insert, Notify laeuft, ok:true', async () => {
    h.aktivData = [{ id: 'termin-nt', status: 'angefragt', wunschtermin: null }]
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(true)

    // Kein Insert — stattdessen Service-Client-Update mit dem UTC-Wunschtermin.
    expect(h.insertSpy).not.toHaveBeenCalled()
    expect(h.updateSpy).toHaveBeenCalledTimes(1)
    const upPayload = h.updateSpy.mock.calls[0][0] as Record<string, unknown>
    expect(typeof upPayload.wunschtermin).toBe('string')
    expect((upPayload.wunschtermin as string).length).toBeGreaterThan(0)

    // Werkstatt-Notify laeuft auch beim Nachtrag (gleicher Helper wie Insert-Pfad).
    expect(h.createNotification).toHaveBeenCalledTimes(1)
    expect(h.createNotification.mock.calls[0][0]).toBe('ws-user-1')
  })

  it('Nachtrag-Race: Update trifft 0 Zeilen -> ok:false mit Reload-Hinweis, kein Insert', async () => {
    h.aktivData = [{ id: 'termin-nt', status: 'angefragt', wunschtermin: null }]
    h.updateResult = { data: [], error: null }
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('neu laden')
    expect(h.insertSpy).not.toHaveBeenCalled()
  })

  it('aktive angefragt-Row MIT Wunschtermin blockt weiterhin (kein Nachtrag, kein Insert)', async () => {
    h.aktivData = [{ id: 'termin-x', status: 'angefragt', wunschtermin: '2026-08-01T09:00:00.000Z' }]
    const r = await schlageReparaturTerminVorPortal('claim-1', '2026-08-15T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.insertSpy).not.toHaveBeenCalled()
    expect(h.updateSpy).not.toHaveBeenCalled()
  })
})
