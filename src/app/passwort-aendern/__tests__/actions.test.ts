import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-auth-haertung: setzeNeuesPasswort ist der Server-Action-Ersatz fuer den
// frueheren Browser-Client-Pfad in /passwort-aendern. Der Browser-Client
// schrieb die Auth-Cookies nach dem Login-Redirect nicht zuverlaessig
// (Cookie-Propagation-Race, NICHT httpOnly) -> "Auth session missing".
// Serverseitig liest createClient die Cookie-Session zuverlaessig.
//
// Diese Tests pruefen die reine Action-Logik mit gemocktem Supabase-Client.

type MockState = {
  user: { id: string } | null
  getUserError: { message: string } | null
  updateUserError: { message: string } | null
  flagUpdateError: { message: string } | null
  rolle: string | null
}
let state: MockState

const getUserMock = vi.fn()
const updateUserMock = vi.fn()
const profilesUpdateEq = vi.fn()
const profilesSelectSingle = vi.fn()

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

import { setzeNeuesPasswort } from '../actions'

beforeEach(() => {
  state = {
    user: { id: 'u-1' },
    getUserError: null,
    updateUserError: null,
    flagUpdateError: null,
    rolle: 'admin',
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
})

describe('setzeNeuesPasswort', () => {
  it('weist Passwoerter unter 8 Zeichen ab — ohne Auth-/DB-Call', async () => {
    const res = await setzeNeuesPasswort('1234567')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('8 Zeichen')
    expect(getUserMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('weist leere Eingabe ab', async () => {
    const res = await setzeNeuesPasswort('')
    expect(res.ok).toBe(false)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('lehnt ab wenn keine Session vorhanden ist (Auth session missing)', async () => {
    state.user = null
    const res = await setzeNeuesPasswort('neuesPasswort1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.toLowerCase()).toContain('angemeldet')
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('gibt updateUser-Fehler als Result zurueck (kein throw)', async () => {
    state.updateUserError = { message: 'Password is too weak' }
    const res = await setzeNeuesPasswort('neuesPasswort1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Password is too weak')
  })

  it('meldet Fehler wenn der force_password_change-Reset scheitert (C2: kein stiller Loop)', async () => {
    state.flagUpdateError = { message: 'rls denied' }
    const res = await setzeNeuesPasswort('neuesPasswort1')
    // Passwort wurde gesetzt, aber das Flag konnte nicht zurueckgesetzt werden
    // -> MUSS als Fehler zurueckkommen, sonst Endlos-Redirect auf /passwort-aendern.
    expect(updateUserMock).toHaveBeenCalledOnce()
    expect(res.ok).toBe(false)
  })

  it('Happy Path: setzt Passwort, loescht Flag, liefert Rollen-Redirect', async () => {
    state.rolle = 'sachverstaendiger'
    const res = await setzeNeuesPasswort('neuesPasswort1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.redirectTo).toBe(roleToPath('sachverstaendiger'))
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'neuesPasswort1' })
    expect(profilesUpdateEq).toHaveBeenCalledWith({ force_password_change: false })
  })

  it('Happy Path ohne Profil-Rolle nutzt roleToPath-Fallback', async () => {
    state.rolle = null
    const res = await setzeNeuesPasswort('neuesPasswort1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.redirectTo).toBe(roleToPath(null))
  })
})
