// Sec-Audit 07.07. — Regressions-Test fuer den IDOR-Guard in waehleGegenvorschlagSlot.
// Vuln (vor #3849): assertKundeOwnsFall prueft nur `fallId`, der `terminId` kam roh vom
// Client -> ein Kunde konnte per fremdem terminId einen fremden SV-Termin ueberschreiben
// + verbindlich bestaetigen. #3849 hat den Guard eingebaut, aber NUR fall_id/claim_id
// geprueft — nicht lead_id. Prod: 24/61 Termine sind lead-only (fall_id+claim_id NULL) ->
// #3849 haette den EIGENEN Termin des Kunden faelschlich abgelehnt. Dieser Test deckt beide
// Achsen ab: Security (fremder Termin -> abgelehnt) UND die lead_id-Regression (eigener
// lead-gekeyter Termin -> akzeptiert). Mock-Muster: siehe reparatur-termin-vorschlag.test.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'kunde-1' } as { id: string } | null,
  ownership: { ok: true, fallId: 'fall-1', claimId: 'claim-1', leadId: 'lead-1', kundeId: 'kunde-1' } as {
    ok: boolean
    fallId?: string
    claimId?: string | null
    leadId?: string | null
    kundeId?: string | null
  },
  terminOwner: null as null | { fall_id: string | null; claim_id: string | null; lead_id: string | null },
  updateSpy: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  bestaetigeTermin: vi.fn(async () => {}),
  touchClaimRecency: vi.fn(async () => {}),
  generateReminder: vi.fn(async () => {}),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'gutachter_termine') {
        return {
          // Guard-Read: .select('fall_id, claim_id, lead_id').eq('id', terminId).maybeSingle()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: h.terminOwner, error: null })),
            })),
          })),
          // Mutations-Write: .update(...).eq('id', terminId)
          update: h.updateSpy,
        }
      }
      if (table === 'leads') {
        return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/claims/kunde-ownership', () => ({
  assertKundeOwnsFall: vi.fn(async () => h.ownership),
}))
vi.mock('@/lib/termine/bestaetigung', () => ({ bestaetigeTermin: h.bestaetigeTermin }))
vi.mock('@/lib/claims/touch-recency', () => ({ touchClaimRecency: h.touchClaimRecency }))
vi.mock('@/lib/reminders/generate', () => ({ generateReminderForTermin: h.generateReminder }))
vi.mock('@/lib/google-calendar/timezone', () => ({
  berlinWallClockToUtc: (s: string) => `${s}Z`,
}))
// Am Modul-Top importiert, aber von dieser Action ungenutzt -> No-op-Stubs (Import-Isolation):
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: vi.fn() }))
vi.mock('@/lib/storage/url', () => ({ getStorageUrl: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { waehleGegenvorschlagSlot } from '../actions'

const slot = { datum: '2026-08-15', uhrzeit: '10:00' }

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'kunde-1' }
  h.ownership = { ok: true, fallId: 'fall-1', claimId: 'claim-1', leadId: 'lead-1', kundeId: 'kunde-1' }
  h.terminOwner = null
  h.updateSpy.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) })
})

describe('waehleGegenvorschlagSlot — IDOR-Guard (Sec-Audit 07.07.)', () => {
  it('fremder terminId (keine FK-Spalte matcht den Fall) -> abgelehnt, KEIN Update/Bestaetigen', async () => {
    h.terminOwner = { fall_id: 'fremd-fall', claim_id: 'fremd-claim', lead_id: 'fremd-lead' }
    const r = await waehleGegenvorschlagSlot('fall-1', 'fremder-termin', slot)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/autorisiert/i)
    expect(h.updateSpy).not.toHaveBeenCalled()
    expect(h.bestaetigeTermin).not.toHaveBeenCalled()
  })

  it('terminId ohne DB-Row (null) -> abgelehnt', async () => {
    h.terminOwner = null
    const r = await waehleGegenvorschlagSlot('fall-1', 'ghost', slot)
    expect(r.success).toBe(false)
    expect(h.updateSpy).not.toHaveBeenCalled()
    expect(h.bestaetigeTermin).not.toHaveBeenCalled()
  })

  it('eigener Termin via fall_id -> Update + Bestaetigen -> success', async () => {
    h.terminOwner = { fall_id: 'fall-1', claim_id: null, lead_id: null }
    const r = await waehleGegenvorschlagSlot('fall-1', 'eigener-termin', slot)
    expect(r.success).toBe(true)
    expect(h.updateSpy).toHaveBeenCalledTimes(1)
    expect(h.bestaetigeTermin).toHaveBeenCalledWith('eigener-termin')
  })

  // DIE #3849-REGRESSION: lead-only Termin (24/61 prod) — #3849 pruefte nur fall_id/claim_id
  // und haette diesen EIGENEN Termin faelschlich abgelehnt. Mit lead_id-Zweig -> akzeptiert.
  it('eigener Termin NUR via lead_id (fall_id/claim_id null) -> akzeptiert (schuetzt lead-gekeyte Termine)', async () => {
    h.terminOwner = { fall_id: null, claim_id: null, lead_id: 'lead-1' }
    const r = await waehleGegenvorschlagSlot('fall-1', 'lead-termin', slot)
    expect(r.success).toBe(true)
    expect(h.updateSpy).toHaveBeenCalledTimes(1)
  })

  it('eigener Termin via claim_id -> akzeptiert', async () => {
    h.terminOwner = { fall_id: null, claim_id: 'claim-1', lead_id: null }
    const r = await waehleGegenvorschlagSlot('fall-1', 'claim-termin', slot)
    expect(r.success).toBe(true)
    expect(h.updateSpy).toHaveBeenCalledTimes(1)
  })

  it('nicht autorisiert (ownership.ok=false) -> abgelehnt, KEIN Update', async () => {
    h.ownership = { ok: false }
    const r = await waehleGegenvorschlagSlot('fremd-fall', 'x', slot)
    expect(r.success).toBe(false)
    expect(h.updateSpy).not.toHaveBeenCalled()
  })
})
