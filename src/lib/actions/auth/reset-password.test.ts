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

const { setSessionSpy, buildLinkMock, sendResetMock, emailLogCount } = vi.hoisted(() => ({
  setSessionSpy: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
  buildLinkMock: vi.fn(),
  sendResetMock: vi.fn(),
  // Anzahl bereits versendeter passwort_reset-Mails in der letzten Stunde (Rate-Limit-Check).
  emailLogCount: vi.fn(() => 0),
}))

vi.mock('next/headers', () => ({ headers: async () => new Map() }))
vi.mock('@/lib/auth/password-policy', () => ({ pruefePasswortStaerke: async () => ({ ok: true }) }))
vi.mock('@/lib/auth/role-redirect', () => ({ roleToPath: () => '/werkstatt' }))
// Passwort-Reset laeuft ueber die APP-Pipeline (nicht Supabases Built-in-Mailer):
// buildWelcomeConfirmLink (generateLink -> hashed_token -> /api/auth/confirm) + sendPasswortReset.
vi.mock('@/lib/auth/welcome-link', () => ({
  buildWelcomeConfirmLink: (...a: unknown[]) => buildLinkMock(...a),
}))
vi.mock('@/lib/email/google/flows', () => ({
  sendPasswortReset: (...a: unknown[]) => sendResetMock(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Rate-Limit-Check: email_log-Count der letzten Stunde.
      if (table === 'email_log') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ gte: async () => ({ count: emailLogCount() }) }) }),
          }),
        }
      }
      // profiles: Vorname fuer die Anrede + force_password_change-Update (confirmPasswordReset).
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { vorname: 'Aaron' } }) }) }),
      }
    },
  }),
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

import { confirmPasswordReset, requestPasswordReset } from './reset-password'

describe('requestPasswordReset — Versand ueber die APP-Pipeline statt Supabase-Built-in-Mailer', () => {
  const CONFIRM_URL =
    'https://app.claimondo.de/api/auth/confirm?token_hash=abc&type=recovery&next=%2Fpasswort-zuruecksetzen'

  beforeEach(() => {
    buildLinkMock.mockReset().mockResolvedValue(CONFIRM_URL)
    sendResetMock.mockReset().mockResolvedValue({ success: true })
    emailLogCount.mockReset().mockReturnValue(0)
  })

  it('baut einen recovery-Link auf /passwort-zuruecksetzen und sendet die branded Mail', async () => {
    const res = await requestPasswordReset('Aaron.Sprafke@Claimondo.de')
    // Email normalisiert (trim + lowercase), type=recovery, Ziel = Reset-Page.
    expect(buildLinkMock).toHaveBeenCalledWith(
      'aaron.sprafke@claimondo.de',
      'recovery',
      '/passwort-zuruecksetzen',
    )
    expect(sendResetMock).toHaveBeenCalledTimes(1)
    const arg = sendResetMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.to).toBe('aaron.sprafke@claimondo.de')
    expect(String(arg.actionUrl)).toContain('/api/auth/confirm')
    expect(res.success).toBe(true)
  })

  it('unbekannte Email (kein Link) -> kein Versand, trotzdem success (Enumeration-Schutz)', async () => {
    buildLinkMock.mockResolvedValue(null)
    const res = await requestPasswordReset('gibtsnicht@example.com')
    expect(sendResetMock).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
  })

  it('Mail-Versand-Fehler bricht nicht durch (silent success, kein Existenz-Leak)', async () => {
    sendResetMock.mockRejectedValue(new Error('SMTP down'))
    const res = await requestPasswordReset('a@b.de')
    expect(res.success).toBe(true)
  })

  it('leere Email -> weder Link-Bau noch Versand', async () => {
    const res = await requestPasswordReset('   ')
    expect(buildLinkMock).not.toHaveBeenCalled()
    expect(sendResetMock).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
  })

  // Anti-Bombing: Supabases Built-in-Rate-Limit faellt mit der App-Pipeline weg.
  // /passwort-vergessen ist oeffentlich + unauthentifiziert -> eigene Drossel noetig.
  it('Rate-Limit (3 Mails/h erreicht) -> kein weiterer Versand, nach aussen ununterscheidbar', async () => {
    emailLogCount.mockReturnValue(3)
    const res = await requestPasswordReset('opfer@example.com')
    expect(sendResetMock).not.toHaveBeenCalled()
    expect(buildLinkMock).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
  })

  it('unter dem Limit -> Versand laeuft normal', async () => {
    emailLogCount.mockReturnValue(2)
    await requestPasswordReset('a@b.de')
    expect(sendResetMock).toHaveBeenCalledTimes(1)
  })

  it('Rate-Limit-Check faellt aus -> FAIL-OPEN (legitimer Reset wird nie blockiert)', async () => {
    emailLogCount.mockImplementation(() => {
      throw new Error('db down')
    })
    const res = await requestPasswordReset('a@b.de')
    expect(sendResetMock).toHaveBeenCalledTimes(1)
    expect(res.success).toBe(true)
  })
})

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
