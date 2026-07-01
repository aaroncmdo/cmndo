import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-auth-haertung (Write-Path-IDOR): die KB-Prozess-Actions loesten claim_id
// via ADMIN-Client auf (RLS-Bypass) + requireKb ist rollen-only -> KB-A konnte
// KB-Bs Fall auf 'klage' zwingen (+ externe LexDrive-Mail). Fix: claim_id via
// RLS-Client aufloesen (scoped den KB auf eigene/unassigned Claims) + hard-fail
// VOR der Status-Transition. Diese Tests sichern die Ownership-Grenze.

let state: { user: { id: string } | null; rolle: string; claimId: string | null }
const transitionMock = vi.fn()
const resolveMock = vi.fn()
const adminFrom = vi.fn(() => ({
  update: () => ({ eq: async () => ({ error: null }) }),
  insert: async () => ({ error: null }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { rolle: state.rolle } }) }) }),
    }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: adminFrom }) }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: (...a: unknown[]) => resolveMock(...a) }))
vi.mock('@/lib/faelle/state-machine', () => ({ transitionFallStatus: (...a: unknown[]) => transitionMock(...a) }))
vi.mock('@/lib/kanzlei-fall/upsert-kanzlei-fall', () => ({ upsertKanzleiFall: async () => ({ ok: true }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { uebergebeFallKlage } from '../prozess'

beforeEach(() => {
  state = { user: { id: 'kb-1' }, rolle: 'kundenbetreuer', claimId: 'claim-1' }
  transitionMock.mockReset()
  resolveMock.mockReset().mockImplementation(async () => state.claimId)
  adminFrom.mockClear()
})

describe('uebergebeFallKlage — Ownership-Gate (Write-Path-IDOR)', () => {
  it('fremder/nicht-eigener Claim (RLS-Resolve=null) -> KEIN Klage-Transition', async () => {
    state.claimId = null
    const res = await uebergebeFallKlage('fall-fremd')
    expect(res.success).toBe(false)
    expect(transitionMock).not.toHaveBeenCalled()
  })

  it('eigener Claim -> Klage-Transition laeuft', async () => {
    const res = await uebergebeFallKlage('fall-eigen')
    expect(res.success).toBe(true)
    expect(transitionMock).toHaveBeenCalledWith('fall-eigen', 'klage', expect.anything())
  })

  it('nicht-KB-Rolle (kunde) abgewiesen -> kein Transition', async () => {
    state.rolle = 'kunde'
    const res = await uebergebeFallKlage('fall-1')
    expect(res.success).toBe(false)
    expect(transitionMock).not.toHaveBeenCalled()
  })
})
