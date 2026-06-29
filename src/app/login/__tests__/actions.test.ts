import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-auth-haertung:
//  G — login() darf KEINE rohen Supabase/DB-Fehlermeldungen an den User
//      durchreichen (?error=). Generische Strings, Detail nur ins Log.
//  I — finalisierePhoneLogin(): der Profil-Write nach verifyOtp lief client-
//      seitig OHNE Error-Check. Jetzt server-seitig als Result-Object.

type State = {
  signInError: { message: string } | null
  user: { id: string } | null
  profile: Record<string, unknown> | null
  profileError: { message: string } | null
  updateError: { message: string } | null
}
let state: State
const updateEqMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn(() => undefined) })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: async () => ({
        data: { user: state.user },
        error: state.signInError,
      }),
      getUser: async () => ({ data: { user: state.user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { nextLevel: 'aal1', currentLevel: 'aal1' },
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: state.profile, error: state.profileError }) }),
      }),
      update: (vals: unknown) => ({ eq: () => updateEqMock(vals) }),
    }),
  })),
}))

import { login, finalisierePhoneLogin } from '../actions'

function fd(extra: Record<string, string> = {}) {
  const f = new FormData()
  f.set('email', 'a@b.de')
  f.set('password', 'secret123')
  for (const [k, v] of Object.entries(extra)) f.set(k, v)
  return f
}

beforeEach(() => {
  state = {
    signInError: null,
    user: { id: 'u-1' },
    profile: { rolle: 'admin', force_password_change: false, auth_provider: 'email' },
    profileError: null,
    updateError: null,
  }
  updateEqMock.mockReset().mockImplementation(() => Promise.resolve({ error: state.updateError }))
})

describe('login — keine rohen Fehler leaken (Befund G)', () => {
  it('zeigt generische Meldung bei signIn-Fehler, nicht den rohen Supabase-String', async () => {
    state.signInError = { message: 'ROH: invalid credentials internal detail' }
    await expect(login(fd())).rejects.toThrow('REDIRECT:/login?error=E-Mail+oder+Passwort+ist+falsch')
    await expect(login(fd())).rejects.not.toThrow(/ROH/)
  })

  it('zeigt generische Meldung bei profile-Fehler, nicht den rohen DB-String', async () => {
    state.profileError = { message: 'ROH: relation "x" does not exist' }
    await expect(login(fd())).rejects.toThrow('REDIRECT:/login?error=Profil+konnte+nicht+geladen+werden')
    await expect(login(fd())).rejects.not.toThrow(/ROH/)
  })
})

describe('finalisierePhoneLogin (Befund I)', () => {
  it('false wenn keine Session', async () => {
    state.user = null
    const res = await finalisierePhoneLogin()
    expect(res.ok).toBe(false)
  })

  it('false (generisch) wenn der Profil-Write scheitert — kein stilles Durchwinken', async () => {
    state.updateError = { message: 'rls denied' }
    const res = await finalisierePhoneLogin()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).not.toContain('rls denied')
  })

  it('setzt auth_provider=phone + force_password_change=false und liefert Rollen-Redirect', async () => {
    state.profile = { rolle: 'makler' }
    const res = await finalisierePhoneLogin()
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.redirectTo).toBe(roleToPath('makler'))
    expect(updateEqMock).toHaveBeenCalledWith({ auth_provider: 'phone', force_password_change: false })
  })
})
