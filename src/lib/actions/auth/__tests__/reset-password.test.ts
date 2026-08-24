import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleToPath } from '@/lib/auth/role-redirect'

// confirmPasswordReset setzt das Passwort nach dem Recovery-Magic-Link + raeumt
// force_password_change. NEU: beim ONBOARDING (frisch angelegter Account, Flag war
// true) bleibt der User eingeloggt und bekommt ein Portal-Redirect-Ziel zurueck —
// konsistent mit dem Einmalpasswort-Login-Flow (/passwort-aendern). Bei Passwort-
// vergessen (Flag war schon false) bleibt es beim Ausloggen -> /login (kein redirectTo).
// Policy (>= 12 + HIBP) ist gemockt, damit die Action-Logik ohne Netzwerk testbar ist.

type MockState = {
  user: { id: string } | null
  getUserError: { message: string } | null
  updateUserError: { message: string } | null
  flagUpdateError: { message: string } | null
  rolle: string | null
  forcePasswordChange: boolean
  policyOk: boolean
}
let state: MockState

const getUserMock = vi.fn()
const updateUserMock = vi.fn()
const profilesSelectSingle = vi.fn()
const adminUpdateEq = vi.fn()
const pruefePasswortStaerkeMock = vi.fn()

// reset-password.ts importiert next/headers (fuer requestPasswordReset) -> stub.
vi.mock('next/headers', () => ({ headers: async () => new Map() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => getUserMock(),
      updateUser: (args: unknown) => updateUserMock(args),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => profilesSelectSingle() }) }),
    }),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (vals: unknown) => ({ eq: () => adminUpdateEq(vals) }),
    }),
  }),
}))

vi.mock('@/lib/auth/password-policy', () => ({
  pruefePasswortStaerke: (pw: string) => pruefePasswortStaerkeMock(pw),
}))

import { confirmPasswordReset } from '../reset-password'

beforeEach(() => {
  state = {
    user: { id: 'u-1' },
    getUserError: null,
    updateUserError: null,
    flagUpdateError: null,
    rolle: 'werkstatt',
    forcePasswordChange: true,
    policyOk: true,
  }
  getUserMock.mockReset().mockImplementation(() =>
    Promise.resolve({ data: { user: state.user }, error: state.getUserError }),
  )
  updateUserMock.mockReset().mockImplementation(() =>
    Promise.resolve({ error: state.updateUserError }),
  )
  profilesSelectSingle.mockReset().mockImplementation(() =>
    Promise.resolve({
      data: { rolle: state.rolle, force_password_change: state.forcePasswordChange },
      error: null,
    }),
  )
  adminUpdateEq.mockReset().mockImplementation(() =>
    Promise.resolve({ error: state.flagUpdateError }),
  )
  pruefePasswortStaerkeMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      state.policyOk ? { ok: true } : { ok: false, error: 'Passwort muss mindestens 12 Zeichen lang sein.' },
    ),
  )
})

describe('confirmPasswordReset', () => {
  it('Policy-Fail -> lehnt ab ohne Auth-/DB-Call', async () => {
    state.policyOk = false
    const res = await confirmPasswordReset('kurz')
    expect(res.success).toBe(false)
    expect(getUserMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('keine Session -> Fehler (Link abgelaufen), kein updateUser', async () => {
    state.user = null
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(res.success).toBe(false)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('updateUser-Fehler -> Result (kein throw) — auf DEUTSCH', async () => {
    // ⚠ Bis 24.08. pruefte dieser Test, dass die ROHE englische Supabase-Meldung
    // durchgereicht wird. Genau dieses Verhalten sperrte am 23.08. einen frisch
    // registrierten Sachverstaendigen aus: Supabase prueft SELBST gegen
    // Have-I-Been-Pwned und antwortet englisch. Der Vertrag dieses Tests ist
    // "Result statt throw"; die Sprache war nur das Vehikel.
    state.updateUserError = { message: 'Password is known to be weak and easy to guess' }
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(res.success).toBe(false)
    expect(res.error).toContain('Daten-Leaks')
    expect(res.error?.toLowerCase()).not.toContain('password')
  })

  it('uebersetzt auch unbekannte Supabase-Fehler statt sie roh zu zeigen', async () => {
    state.updateUserError = { message: 'unexpected_failure: connection reset by peer' }
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(res.success).toBe(false)
    expect(res.error).not.toContain('connection reset')
    expect(res.error).toContain('erneut versuchen')
  })

  it('flagError -> Fehler (kein stiller Loop-Trap)', async () => {
    state.flagUpdateError = { message: 'rls denied' }
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(updateUserMock).toHaveBeenCalledOnce()
    expect(res.success).toBe(false)
  })

  it('Onboarding (force_password_change war true) -> eingeloggt bleiben, redirectTo = Portal', async () => {
    state.forcePasswordChange = true
    state.rolle = 'werkstatt'
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(res.success).toBe(true)
    expect(res.redirectTo).toBe(roleToPath('werkstatt')) // '/werkstatt'
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'einLangesSicheresPasswort' })
  })

  it('Passwort-vergessen (force_password_change war false) -> KEIN redirectTo (Page loggt aus)', async () => {
    state.forcePasswordChange = false
    const res = await confirmPasswordReset('einLangesSicheresPasswort')
    expect(res.success).toBe(true)
    expect(res.redirectTo).toBeUndefined()
  })
})
