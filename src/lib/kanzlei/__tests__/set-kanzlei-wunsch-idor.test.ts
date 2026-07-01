import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-auth-haertung (Write-Path-IDOR): setKanzleiWunsch liess (via requireRole)
// auch `kunde` zu, mutierte dann aber per admin-client (RLS-Bypass) claims mit
// caller-supplied claim_id OHNE Ownership -> ein kunde konnte fremde Claims'
// kanzlei_wunsch setzen + (in Regulierung) das Auto-Paket-Senden fremder
// Fall-Daten ausloesen. Fix: RLS-Read-Gate (wie applyKanzleiPaket).

let state: { user: { id: string } | null; rolle: string; claimVisible: boolean }
const adminFrom = vi.fn((_t: string) => ({
  update: () => ({ eq: async () => ({ error: null }) }),
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({ data: { id: 'c1', status: 'offen' } }),
      in: () => ({ maybeSingle: async () => ({ data: null }) }),
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === 'profiles'
                ? { rolle: state.rolle, vorname: null, nachname: null }
                : state.claimVisible
                  ? { id: 'c1' }
                  : null,
          }),
        }),
      }),
    }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: adminFrom }) }))
vi.mock('@/lib/email/google/client', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/notifications/emit', () => ({ emitEvent: vi.fn() }))
vi.mock('@/lib/claims/endzustand-actions', () => ({ markClaimAsAnExterneKanzlei: vi.fn() }))
vi.mock('@/lib/claims/claim-phase-map', () => ({ getClaimPhaseMap: vi.fn(async () => new Map()) }))
vi.mock('../queries', () => ({ getPartnerKanzleiSettings: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setKanzleiWunsch } from '../actions'

beforeEach(() => {
  state = { user: { id: 'u1' }, rolle: 'kunde', claimVisible: false }
  adminFrom.mockClear()
})

describe('setKanzleiWunsch — Ownership-Gate (Write-Path-IDOR)', () => {
  it('kunde mit fremder claim_id (RLS-Read null) -> reject, KEIN admin-Write', async () => {
    const res = await setKanzleiWunsch({
      claim_id: 'victim-claim',
      wunsch: 'partnerkanzlei',
      gefragt_in_phase: 'phase_4_re_frage',
    })
    expect(res.ok).toBe(false)
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('kunde mit eigenem Claim (RLS sichtbar) darf den Wunsch setzen', async () => {
    state.claimVisible = true
    const res = await setKanzleiWunsch({
      claim_id: 'own-claim',
      wunsch: 'keine_kanzlei',
      gefragt_in_phase: 'phase_4_re_frage',
    })
    expect(res.ok).toBe(true)
    expect(adminFrom).toHaveBeenCalledWith('claims')
  })
})
