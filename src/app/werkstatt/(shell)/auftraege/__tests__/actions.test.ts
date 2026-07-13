// SP2 Task 5 — Tests fuer die Werkstatt-Reparaturtermin-Actions.
// Fokus: Result-Object-Shape + RLS-0-Row-Verhalten + Notify-Ausloesung je Ereignis.
// Der Status-Update laeuft ueber die auth-aware Session (createClient); RLS ist der
// eigentliche Schutz — hier gemockt, verifiziert wird die Steuer-Logik der Action.
//
// SP Task 7 — schlageWerkstattTerminVor + upsertWerkstattVorschlag-Reuse im KVA-Pfad.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted Holders (von den vi.mock-Factories referenziert) ────────────────
const h = vi.hoisted(() => ({
  // Ergebnis der update(...).eq(...).select(...).maybeSingle()-Kette
  updateResult: { data: { claim_id: 'c1' } as Record<string, unknown> | null, error: null as { message: string } | null },
  notify: vi.fn().mockResolvedValue({ email: true, inApp: true }),
  // SP Task 7 — Admin-Client-Mock fuer upsertWerkstattVorschlag
  adminSelectResult: { data: [] as { id: string }[] | null, error: null as { message: string } | null },
  adminUpdateResult: { error: null as { message: string } | null },
  adminInsertResult: { error: null as { message: string } | null },
  // getWerkstattAuftrag result
  werkstattAuftrag: {
    claim_id: 'c1',
    reparatur_werkstatt_id: 'ws1',
  } as { claim_id: string; reparatur_werkstatt_id: string | null } | null,
}))

vi.mock('@/lib/auth/portal-guard', () => ({
  requirePortalAccess: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/werkstatt/notify-kunde-reparaturtermin', () => ({
  notifyKundeReparaturtermin: h.notify,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockImplementation(async () => h.updateResult),
          })),
        })),
      })),
    })),
  }),
  createServiceClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockImplementation(async () => h.adminSelectResult),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockImplementation(async () => h.adminUpdateResult),
      })),
      insert: vi.fn().mockImplementation(async () => h.adminInsertResult),
    })),
  })),
}))
vi.mock('@/lib/werkstatt/queries', () => ({
  getWerkstattAuftrag: vi.fn().mockImplementation(async () => h.werkstattAuftrag),
}))
vi.mock('@/app/flow/[token]/wunschtermin', () => ({
  resolveWunschterminIso: vi.fn((s: string) => s ? '2026-07-20T08:00:00.000Z' : null),
}))

beforeEach(() => {
  h.updateResult = { data: { claim_id: 'c1' }, error: null }
  h.notify.mockClear()
  h.adminSelectResult = { data: [], error: null }
  h.adminUpdateResult = { error: null }
  h.adminInsertResult = { error: null }
  h.werkstattAuftrag = { claim_id: 'c1', reparatur_werkstatt_id: 'ws1' }
})

describe('bestaetigeReparaturtermin', () => {
  it('Erfolg -> ok:true + Notify (ereignis=bestaetigt)', async () => {
    const { bestaetigeReparaturtermin } = await import('../actions')
    const r = await bestaetigeReparaturtermin('t1', '2026-07-15T10:00:00Z')
    expect(r.ok).toBe(true)
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0].ereignis).toBe('bestaetigt')
    expect(h.notify.mock.calls[0][0].claimId).toBe('c1')
  })

  it('RLS-0-Row (kein data) -> ok:false, kein Notify', async () => {
    h.updateResult = { data: null, error: null }
    const { bestaetigeReparaturtermin } = await import('../actions')
    const r = await bestaetigeReparaturtermin('fremd')
    expect(r.ok).toBe(false)
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('DB-Fehler -> ok:false mit Fehlermeldung', async () => {
    h.updateResult = { data: null, error: { message: 'boom' } }
    const { bestaetigeReparaturtermin } = await import('../actions')
    const r = await bestaetigeReparaturtermin('t1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})

describe('erbitteRueckruf', () => {
  it('Erfolg -> ok:true + Notify (ereignis=anruf_erbeten)', async () => {
    const { erbitteRueckruf } = await import('../actions')
    const r = await erbitteRueckruf('t1')
    expect(r.ok).toBe(true)
    expect(h.notify.mock.calls[0][0].ereignis).toBe('anruf_erbeten')
  })
})

describe('lehneReparaturterminAb', () => {
  it('mit Grund -> ok:true + Notify (ereignis=abgelehnt)', async () => {
    const { lehneReparaturterminAb } = await import('../actions')
    const r = await lehneReparaturterminAb('t1', 'Kein Termin frei')
    expect(r.ok).toBe(true)
    expect(h.notify.mock.calls[0][0].ereignis).toBe('abgelehnt')
  })

  it('RLS-0-Row -> ok:false', async () => {
    h.updateResult = { data: null, error: null }
    const { lehneReparaturterminAb } = await import('../actions')
    const r = await lehneReparaturterminAb('fremd', 'Grund')
    expect(r.ok).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// schlageWerkstattTerminVor — SP Task 7
// ─────────────────────────────────────────────────────────────────────────────

describe('schlageWerkstattTerminVor', () => {
  it('INSERT-Pfad (kein aktiver Termin) -> ok:true + Notify werkstatt_vorschlag', async () => {
    // adminSelectResult = [] -> kein bestehender Termin -> INSERT
    h.adminSelectResult = { data: [], error: null }
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '2026-07-20T10:00')
    expect(r.ok).toBe(true)
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0].ereignis).toBe('werkstatt_vorschlag')
    expect(h.notify.mock.calls[0][0].claimId).toBe('c1')
  })

  it('UPDATE-Pfad (bestehender Termin) -> ok:true + Notify werkstatt_vorschlag', async () => {
    // adminSelectResult = [{ id: 't1' }] -> bestehender Termin -> UPDATE
    h.adminSelectResult = { data: [{ id: 't1' }], error: null }
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '2026-07-20T10:00')
    expect(r.ok).toBe(true)
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.notify.mock.calls[0][0].ereignis).toBe('werkstatt_vorschlag')
  })

  it('kein claimId -> ok:false, kein Notify', async () => {
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('', '2026-07-20T10:00')
    expect(r.ok).toBe(false)
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('kein terminLokal -> ok:false, kein Notify', async () => {
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '')
    expect(r.ok).toBe(false)
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('Ownership-Gate kein Auftrag -> ok:false, kein Notify', async () => {
    h.werkstattAuftrag = null
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('fremd', '2026-07-20T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/kein zugriff/i)
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('keine reparatur_werkstatt_id -> ok:false', async () => {
    h.werkstattAuftrag = { claim_id: 'c1', reparatur_werkstatt_id: null }
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '2026-07-20T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/keine reparatur-werkstatt/i)
  })

  it('DB-Fehler beim INSERT -> ok:false mit Fehlermeldung', async () => {
    h.adminSelectResult = { data: [], error: null }
    h.adminInsertResult = { error: { message: 'insert-fail' } }
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '2026-07-20T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('insert-fail')
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('DB-Fehler beim UPDATE -> ok:false mit Fehlermeldung', async () => {
    h.adminSelectResult = { data: [{ id: 't1' }], error: null }
    h.adminUpdateResult = { error: { message: 'update-fail' } }
    const { schlageWerkstattTerminVor } = await import('../actions')
    const r = await schlageWerkstattTerminVor('c1', '2026-07-20T10:00')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('update-fail')
    expect(h.notify).not.toHaveBeenCalled()
  })
})
