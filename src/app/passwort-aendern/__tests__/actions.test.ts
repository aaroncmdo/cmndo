import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-auth-haertung: setzeNeuesPasswort ist der Server-Action-Ersatz fuer den
// frueheren Browser-Client-Pfad in /passwort-aendern. Der Browser-Client
// schrieb die Auth-Cookies nach dem Login-Redirect nicht zuverlaessig
// (Cookie-Propagation-Race, NICHT httpOnly) -> "Auth session missing".
// Serverseitig liest createClient die Cookie-Session zuverlaessig.
//
// Die Passwort-Staerke-Pruefung (>= 12 Zeichen + HIBP-Breach-Check) ist an die
// zentrale Policy pruefePasswortStaerke delegiert — identisch zu
// confirmPasswordReset. Hier gemockt, damit die Action-Logik ohne Netzwerk
// (HIBP-Range-Fetch) testbar bleibt.

type MockState = {
  user: { id: string } | null
  getUserError: { message: string } | null
  updateUserError: { message: string } | null
  flagUpdateError: { message: string } | null
  rolle: string | null
  policyOk: boolean
}
let state: MockState

const getUserMock = vi.fn()
const updateUserMock = vi.fn()
const profilesUpdateEq = vi.fn()
const profilesSelectSingle = vi.fn()
const pruefePasswortStaerkeMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => getUserMock(),
      updateUser: (args: unknown) => updateUserMock(args),
    },
    from: () => ({
      update: (vals: unknown) => ({ eq: () => profilesUpdateEq(vals) }),
      select: () => ({ eq: () => ({ single: () => profilesSelectSingle() }) }),
    }),
  })),
}))

vi.mock('@/lib/auth/password-policy', () => ({
  pruefePasswortStaerke: (pw: string) => pruefePasswortStaerkeMock(pw),
}))

import { setzeNeuesPasswort } from '../actions'

beforeEach(() => {
  state = {
    user: { id: 'u-1' },
    getUserError: null,
    updateUserError: null,
    flagUpdateError: null,
    rolle: 'admin',
    policyOk: true,
  }
  getUserMock.mockReset().mockImplementation(() =>
    Promise.resolve({ data: { user: state.user }, error: state.getUserError }),
  )
  updateUserMock.mockReset().mockImplementation(() =>
    Promise.resolve({ error: state.updateUserError }),
  )
  profilesUpdateEq.mockReset().mockImplementation(() =>
    Promise.resolve({ error: state.flagUpdateError }),
  )
  profilesSelectSingle.mockReset().mockImplementation(() =>
    Promise.resolve({ data: state.rolle ? { rolle: state.rolle } : null, error: null }),
  )
  pruefePasswortStaerkeMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      state.policyOk
        ? { ok: true }
        : { ok: false, error: 'Passwort muss mindestens 12 Zeichen lang sein.' },
    ),
  )
})

describe('setzeNeuesPasswort', () => {
  it('delegiert an pruefePasswortStaerke und lehnt bei Policy-Fail ab — ohne Auth-/DB-Call', async () => {
    state.policyOk = false
    const res = await setzeNeuesPasswort('kurz')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('12 Zeichen')
    expect(pruefePasswortStaerkeMock).toHaveBeenCalledWith('kurz')
    // Policy-Fail MUSS vor jedem Auth-/DB-Zugriff greifen.
    expect(getUserMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('leere Eingabe wird von der Policy abgelehnt — kein updateUser', async () => {
    state.policyOk = false
    const res = await setzeNeuesPasswort('')
    expect(res.ok).toBe(false)
    expect(pruefePasswortStaerkeMock).toHaveBeenCalledWith('')
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('lehnt ab wenn keine Session vorhanden ist (Auth session missing)', async () => {
    state.user = null
    const res = await setzeNeuesPasswort('einLangesSicheresPasswort')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.toLowerCase()).toContain('angemeldet')
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('gibt updateUser-Fehler als Result zurueck (kein throw)', async () => {
    state.updateUserError = { message: 'Password is too weak' }
    const res = await setzeNeuesPasswort('einLangesSicheresPasswort')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Password is too weak')
  })

  it('meldet Fehler wenn der force_password_change-Reset scheitert (C2: kein stiller Loop)', async () => {
    state.flagUpdateError = { message: 'rls denied' }
    const res = await setzeNeuesPasswort('einLangesSicheresPasswort')
    // Passwort wurde gesetzt, aber das Flag konnte nicht zurueckgesetzt werden
    // -> MUSS als Fehler zurueckkommen, sonst Endlos-Redirect auf /passwort-aendern.
    expect(updateUserMock).toHaveBeenCalledOnce()
    expect(res.ok).toBe(false)
  })

  it('Happy Path: setzt Passwort, loescht Flag, liefert Rollen-Redirect', async () => {
    state.rolle = 'sachverstaendiger'
    const res = await setzeNeuesPasswort('einLangesSicheresPasswort')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.redirectTo).toBe(roleToPath('sachverstaendiger'))
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'einLangesSicheresPasswort' })
    expect(profilesUpdateEq).toHaveBeenCalledWith({ force_password_change: false })
  })

  it('Happy Path ohne Profil-Rolle nutzt roleToPath-Fallback', async () => {
    state.rolle = null
    const res = await setzeNeuesPasswort('einLangesSicheresPasswort')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.redirectTo).toBe(roleToPath(null))
  })
})
