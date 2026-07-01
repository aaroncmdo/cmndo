import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-auth-haertung (Write-Path-IDOR): diese dispatch-Actions nutzen den
// admin-client (RLS-Bypass) und pruefen vorher nur `if (!user)` — ein
// authentifizierter, aber NICHT berechtigter User (z.B. kunde) kam durch.
// Diese Tests sichern: ohne dispatch/kb/admin-Rolle KEIN admin-client-Zugriff.

let state: { user: { id: string } | null; rolle: string | null }
const adminFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.rolle ? { rolle: state.rolle, vorname: null, nachname: null } : null,
          }),
        }),
      }),
    }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: adminFrom }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { findKundenMatches, linkLeadToExistingKunde, unlinkLeadKunde } from '../kunden-match'
import { checkEmailIsSv } from '../email-sv-check'

beforeEach(() => {
  state = { user: { id: 'u1' }, rolle: 'dispatch' }
  adminFrom.mockReset().mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) })
})

describe('dispatch kunden-match / email-sv IDOR-Guards', () => {
  it('linkLeadToExistingKunde: kunde-Rolle wird abgewiesen — kein admin-client', async () => {
    state.rolle = 'kunde'
    const res = await linkLeadToExistingKunde('lead-1', 'victim-user-id')
    expect(res.ok).toBe(false)
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('linkLeadToExistingKunde: nicht eingeloggt wird abgewiesen', async () => {
    state.user = null
    const res = await linkLeadToExistingKunde('lead-1', 'victim-user-id')
    expect(res.ok).toBe(false)
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('linkLeadToExistingKunde: dispatch-Rolle darf (admin-client wird genutzt)', async () => {
    const res = await linkLeadToExistingKunde('lead-1', 'kunde-1')
    expect(res.ok).toBe(true)
    expect(adminFrom).toHaveBeenCalledWith('leads')
  })

  it('unlinkLeadKunde: kunde-Rolle wird abgewiesen — kein admin-client', async () => {
    state.rolle = 'kunde'
    const res = await unlinkLeadKunde('lead-1')
    expect(res.ok).toBe(false)
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('findKundenMatches: kunde-Rolle wird abgewiesen — kein PII-Harvest', async () => {
    state.rolle = 'kunde'
    const res = await findKundenMatches('lead-1')
    expect(res.ok).toBe(false)
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('checkEmailIsSv: kunde-Rolle -> fail-closed {isSv:false}, kein Oracle', async () => {
    state.rolle = 'kunde'
    const res = await checkEmailIsSv('sv@example.de')
    expect(res).toEqual({ isSv: false })
    expect(adminFrom).not.toHaveBeenCalled()
  })
})
