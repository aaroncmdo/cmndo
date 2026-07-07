// Regression-Guard fuer den Hash-Recovery-Session-Handoff (Welcome-Magic-Link-Fix).
//
// Werkstatt-/SV-Willkommens-Mails nutzen admin.generateLink({ type: 'recovery' }) → eine
// IMPLICIT-Session im URL-Hash. Der Browser-Client haelt sie nur in-memory (kein Cookie), daher
// reicht die /passwort-zuruecksetzen-Page die Recovery-Tokens an confirmPasswordReset durch und
// diese etabliert die Session serverseitig via setSession. Ohne das findet getUser() keine
// Session → der Reset schlaegt bei jedem Welcome-Magic-Link STILL fehl (Passwort nie gesetzt).
//
// Dieser Test fixiert: setSession wird MIT den Tokens gerufen (Hash-Flow) bzw. NICHT gerufen
// (PKCE-?code-Cookie-Flow / Forgot-Password, unveraendert).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { setSessionSpy } = vi.hoisted(() => ({
  setSessionSpy: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
}))

vi.mock('next/headers', () => ({ headers: async () => new Map() }))
vi.mock('@/lib/auth/password-policy', () => ({ pruefePasswortStaerke: async () => ({ ok: true }) }))
vi.mock('@/lib/auth/role-redirect', () => ({ roleToPath: () => '/werkstatt' }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      setSession: setSessionSpy,
      getUser: async () => ({ data: { user: { id: 'u' } }, error: null }),
      updateUser: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { rolle: 'werkstatt', force_password_change: true } }) }),
      }),
    }),
  }),
}))

import { confirmPasswordReset } from './reset-password'

describe('confirmPasswordReset — Hash-Recovery Session-Handoff (Welcome-Magic-Link-Fix)', () => {
  beforeEach(() => {
    setSessionSpy.mockClear()
  })

  it('etabliert die Session serverseitig via setSession, wenn Recovery-Tokens uebergeben werden', async () => {
    const res = await confirmPasswordReset('TestPasswort1234!', {
      access_token: 'at-hash',
      refresh_token: 'rt-hash',
    })
    expect(setSessionSpy).toHaveBeenCalledWith({ access_token: 'at-hash', refresh_token: 'rt-hash' })
    expect(res.success).toBe(true)
    // Onboarding (force_password_change war true) → direkt ins Portal.
    expect(res.redirectTo).toBe('/werkstatt')
  })

  it('ruft setSession NICHT ohne Tokens (PKCE-?code-Cookie-Flow / Forgot-Password unveraendert)', async () => {
    const res = await confirmPasswordReset('TestPasswort1234!')
    expect(setSessionSpy).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
  })
})
