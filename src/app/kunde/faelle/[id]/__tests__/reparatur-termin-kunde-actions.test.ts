// SP4b Task 8 — Tests fuer akzeptiereWerkstattTermin + werkstattTerminPasstNicht.
// Mock-Strategie: Supabase createClient (Kunde-Session, RLS-aware via .eq('status','werkstatt_vorschlag'))
// + createServiceClient (Service-Role fuer Werkstatt-user_id-Lookup in notifyWerkstattKundenreaktion).
// Fokus: Result-Object-Shape + RLS-0-Row-Verhalten + Notify-Ausloesung je Ereignis.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted Holders ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  // Ergebnis der update().eq().eq().select().maybeSingle()-Kette
  updateResult: {
    data: null as { claim_id: string; werkstatt_id: string } | null,
    error: null as { message: string } | null,
  },
  notifyWerkstatt: vi.fn().mockResolvedValue({ inApp: true }),
  revalidatePath: vi.fn(),
  resolveWunschterminIso: vi.fn((s: string) => s ? '2026-08-20T09:00:00.000Z' : null),
}))

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: h.user },
      })),
    },
    from: vi.fn((_table: string) => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn().mockImplementation(async () => h.updateResult),
            })),
          })),
        })),
      })),
    })),
  }),
  createServiceClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/werkstatt/notify-werkstatt-kundenreaktion', () => ({
  notifyWerkstattKundenreaktion: h.notifyWerkstatt,
}))

vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))

vi.mock('@/app/flow/[token]/wunschtermin', () => ({
  resolveWunschterminIso: h.resolveWunschterminIso,
}))

// createNotification wird nicht direkt von diesen Actions gerufen (nur via notifyWerkstattKundenreaktion)
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

// ─── Import (nach Mocks) ─────────────────────────────────────────────────────

import {
  akzeptiereWerkstattTermin,
  werkstattTerminPasstNicht,
} from '../reparatur-termin-actions'

// ─── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'kunde-user-1' }
  h.updateResult = {
    data: { claim_id: 'claim-1', werkstatt_id: 'ws-1' },
    error: null,
  }
  h.notifyWerkstatt.mockResolvedValue({ inApp: true })
  h.resolveWunschterminIso.mockImplementation((s: string) => s ? '2026-08-20T09:00:00.000Z' : null)
})

// ─── akzeptiereWerkstattTermin ───────────────────────────────────────────────

describe('akzeptiereWerkstattTermin', () => {
  it('kein terminId -> ok:false, kein Update', async () => {
    const r = await akzeptiereWerkstattTermin('')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('kein User -> ok:false, kein Notify', async () => {
    h.user = null
    const r = await akzeptiereWerkstattTermin('termin-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('RLS-0-Row (data null, kein error) -> ok:false, kein Notify', async () => {
    h.updateResult = { data: null, error: null }
    const r = await akzeptiereWerkstattTermin('fremd-termin')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('DB-Fehler -> ok:false mit Fehlermeldung, kein Notify', async () => {
    h.updateResult = { data: null, error: { message: 'db-boom' } }
    const r = await akzeptiereWerkstattTermin('termin-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('db-boom')
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('Erfolg -> ok:true + revalidatePath kunde+werkstatt + Notify (ereignis=bestaetigt, werkstattId)', async () => {
    const r = await akzeptiereWerkstattTermin('termin-1')
    expect(r.ok).toBe(true)

    // revalidatePath fuer beide Routen
    expect(h.revalidatePath).toHaveBeenCalledWith('/kunde/faelle/claim-1')
    expect(h.revalidatePath).toHaveBeenCalledWith('/werkstatt/auftraege')

    // Notify mit korrekten Parametern
    expect(h.notifyWerkstatt).toHaveBeenCalledTimes(1)
    const call = h.notifyWerkstatt.mock.calls[0][0] as Record<string, unknown>
    expect(call.werkstattId).toBe('ws-1')
    expect(call.ereignis).toBe('bestaetigt')
    // kein rueckrufWunschzeit bei Bestaetigung
    expect(call.rueckrufWunschzeit).toBeUndefined()
  })

  it('Notify-Fehler ist non-fatal -> ok:true trotz Notify-Exception', async () => {
    h.notifyWerkstatt.mockRejectedValueOnce(new Error('notify-failed'))
    const r = await akzeptiereWerkstattTermin('termin-1')
    expect(r.ok).toBe(true)
  })
})

// ─── werkstattTerminPasstNicht ───────────────────────────────────────────────

describe('werkstattTerminPasstNicht', () => {
  it('kein terminId -> ok:false, kein Notify', async () => {
    const r = await werkstattTerminPasstNicht('')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('kein User -> ok:false, kein Notify', async () => {
    h.user = null
    const r = await werkstattTerminPasstNicht('termin-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('RLS-0-Row -> ok:false, kein Notify', async () => {
    h.updateResult = { data: null, error: null }
    const r = await werkstattTerminPasstNicht('fremd-termin')
    expect(r.ok).toBe(false)
    expect(h.notifyWerkstatt).not.toHaveBeenCalled()
  })

  it('DB-Fehler -> ok:false mit Fehlermeldung', async () => {
    h.updateResult = { data: null, error: { message: 'update-fail' } }
    const r = await werkstattTerminPasstNicht('termin-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('update-fail')
  })

  it('Erfolg ohne Wunschzeit -> ok:true + Notify (ereignis=rueckruf_erbeten, kein rueckrufWunschzeit)', async () => {
    const r = await werkstattTerminPasstNicht('termin-1')
    expect(r.ok).toBe(true)

    expect(h.revalidatePath).toHaveBeenCalledWith('/kunde/faelle/claim-1')
    expect(h.revalidatePath).toHaveBeenCalledWith('/werkstatt/auftraege')

    expect(h.notifyWerkstatt).toHaveBeenCalledTimes(1)
    const call = h.notifyWerkstatt.mock.calls[0][0] as Record<string, unknown>
    expect(call.werkstattId).toBe('ws-1')
    expect(call.ereignis).toBe('rueckruf_erbeten')
    expect(call.rueckrufWunschzeit).toBeNull()
  })

  it('Erfolg mit Wunschzeit -> ok:true + Notify (rueckrufWunschzeit = UTC-ISO)', async () => {
    const r = await werkstattTerminPasstNicht('termin-1', '2026-08-20T11:00')
    expect(r.ok).toBe(true)

    expect(h.notifyWerkstatt).toHaveBeenCalledTimes(1)
    const call = h.notifyWerkstatt.mock.calls[0][0] as Record<string, unknown>
    expect(call.ereignis).toBe('rueckruf_erbeten')
    // resolveWunschterminIso wurde aufgerufen und UTC-ISO wird durchgereicht
    expect(call.rueckrufWunschzeit).toBe('2026-08-20T09:00:00.000Z')
  })

  it('Notify-Fehler ist non-fatal -> ok:true trotz Notify-Exception', async () => {
    h.notifyWerkstatt.mockRejectedValueOnce(new Error('notify-failed'))
    const r = await werkstattTerminPasstNicht('termin-1')
    expect(r.ok).toBe(true)
  })
})
