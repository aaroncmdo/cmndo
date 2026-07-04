// SP2 Task 5 — Tests fuer die Werkstatt-Reparaturtermin-Actions.
// Fokus: Result-Object-Shape + RLS-0-Row-Verhalten + Notify-Ausloesung je Ereignis.
// Der Status-Update laeuft ueber die auth-aware Session (createClient); RLS ist der
// eigentliche Schutz — hier gemockt, verifiziert wird die Steuer-Logik der Action.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted Holders (von den vi.mock-Factories referenziert) ────────────────
const h = vi.hoisted(() => ({
  // Ergebnis der update(...).eq(...).select(...).maybeSingle()-Kette
  updateResult: { data: { claim_id: 'c1' } as Record<string, unknown> | null, error: null as { message: string } | null },
  notify: vi.fn().mockResolvedValue({ email: true, inApp: true }),
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

beforeEach(() => {
  h.updateResult = { data: { claim_id: 'c1' }, error: null }
  h.notify.mockClear()
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
