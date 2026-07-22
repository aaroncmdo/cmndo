import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-auth-haertung (Befund D): requirePortalAccess erzwingt force_password_change
// jetzt pro Request (nicht nur im Login-Action). Sonst behaelt ein User, dem das
// Flag mid-session gesetzt wurde (z.B. Admin-Reset), Portal-Zugang bis zum
// naechsten Login.

type Profile = {
  rolle: string
  vorname: string | null
  nachname: string | null
  force_password_change?: boolean | null
  auth_provider?: string | null
}
type MockUser = {
  id: string
  email: string
  app_metadata?: { provider?: string }
  factors?: { status: string; factor_type?: string }[]
}
let state: { user: MockUser | null; profile: Profile | null }

const getUserMock = vi.fn()
const maybeSingleMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingleMock() }) }),
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { requirePortalAccess } from './portal-guard'

beforeEach(() => {
  state = {
    // Interne Rolle (admin), Passwort-Login. factors/app_metadata sind fuer
    // requirePortalAccess irrelevant — das 2FA-Gate lebt seit AAR-939 in der
    // Middleware (src/lib/supabase/middleware.ts + mfa-gate.ts), nicht hier.
    user: {
      id: 'u-1',
      email: 'a@b.de',
      app_metadata: {},
      factors: [{ status: 'verified', factor_type: 'phone' }],
    },
    profile: { rolle: 'admin', vorname: 'A', nachname: 'B', force_password_change: false, auth_provider: 'email' },
  }
  getUserMock.mockReset().mockImplementation(() =>
    Promise.resolve({ data: { user: state.user } }),
  )
  maybeSingleMock.mockReset().mockImplementation(() =>
    Promise.resolve({ data: state.profile, error: null }),
  )
})

describe('requirePortalAccess — force_password_change (Befund D)', () => {
  it('leitet auf /passwort-aendern wenn force_password_change && email — auch bei korrekter Rolle', async () => {
    state.profile = { rolle: 'admin', vorname: 'A', nachname: 'B', force_password_change: true, auth_provider: 'email' }
    await expect(requirePortalAccess(['admin'])).rejects.toThrow('REDIRECT:/passwort-aendern')
  })

  it('leitet NICHT auf /passwort-aendern bei Google-Login (kein Passwort)', async () => {
    state.profile = { rolle: 'admin', vorname: 'A', nachname: 'B', force_password_change: true, auth_provider: 'google' }
    const res = await requirePortalAccess(['admin'])
    expect(res.profile.rolle).toBe('admin')
  })

  it('laesst durch wenn force_password_change false', async () => {
    const res = await requirePortalAccess(['admin'])
    expect(res.profile.rolle).toBe('admin')
  })
})

describe('requirePortalAccess — bestehende Guards (Regression)', () => {
  it('leitet auf /login ohne Session', async () => {
    state.user = null
    await expect(requirePortalAccess(['admin'])).rejects.toThrow('REDIRECT:/login')
  })

  it('leitet ins eigene Portal bei falscher Rolle', async () => {
    state.profile = { rolle: 'kunde', vorname: 'K', nachname: 'U', force_password_change: false, auth_provider: 'email' }
    await expect(requirePortalAccess(['admin'])).rejects.toThrow('REDIRECT:/kunde')
  })

  it('force_password_change hat Vorrang vor dem Rollen-Redirect', async () => {
    state.profile = { rolle: 'kunde', vorname: 'K', nachname: 'U', force_password_change: true, auth_provider: 'email' }
    await expect(requirePortalAccess(['admin'])).rejects.toThrow('REDIRECT:/passwort-aendern')
  })
})

// Die 2FA-Pflicht (F3) wird bewusst NICHT hier getestet: seit AAR-939 enforced die
// Middleware (src/lib/supabase/middleware.ts via Supabase-MFA/AAL, Pure-Logik in
// src/lib/auth/mfa-gate.ts, getestet in mfa-gate.test.ts) das aal2-Gate am Edge —
// VOR jedem RSC-Render. requirePortalAccess gated absichtlich NICHT auf 2FA (das
// waere der falsche Layer). Der frueher hier stehende F3-Block war stale: er testete
// 2FA-Verhalten in requirePortalAccess, das dort nie existierte — 3 der 4 Tests
// bestanden nur vacuously (requirePortalAccess liest factors/app_metadata gar nicht),
// der negative Test schlug fehl (kein /login/2fa-Redirect, weil es hier keinen gibt).
