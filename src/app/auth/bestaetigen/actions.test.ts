// Sicherheits-Guard fuer den Klick-Bestaetigungs-Endpunkt (Prefetch-Haertung).
// Kern: verifyOtp laeuft NUR mit gueltigem token+type; danach IMMER ein redirect
// (Erfolg -> next, Fehler -> /login). Plus Open-Redirect-Schutz auf `next` und
// Typ-Whitelist.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { redirectMock, verifyOtpMock } = vi.hoisted(() => ({
  // redirect() wirft in Next intern (NEXT_REDIRECT) -> hier: aufnehmen + werfen,
  // damit der Kontrollfluss wie in echt abbricht.
  redirectMock: vi.fn((url: string) => {
    throw new Error('REDIRECT:' + url)
  }),
  verifyOtpMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp: verifyOtpMock } }),
}))

import { bestaetigeMagicLink } from './actions'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

async function run(entries: Record<string, string>) {
  try {
    await bestaetigeMagicLink(fd(entries))
    return null
  } catch (e) {
    return (e as Error).message // "REDIRECT:<url>"
  }
}

describe('bestaetigeMagicLink — Klick-Gate', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    verifyOtpMock.mockReset().mockResolvedValue({ error: null })
  })

  it('gueltiger Token: ruft verifyOtp und leitet auf `next`', async () => {
    const r = await run({ token_hash: 'h1', type: 'recovery', next: '/passwort-zuruecksetzen' })
    expect(verifyOtpMock).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'h1' })
    expect(r).toBe('REDIRECT:/passwort-zuruecksetzen')
  })

  it('verifyOtp-Fehler: KEIN Weiterleiten auf next, sondern /login mit Hinweis', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'otp_expired' } })
    const r = await run({ token_hash: 'h1', type: 'recovery', next: '/passwort-zuruecksetzen' })
    expect(r).toContain('REDIRECT:/login?error=')
  })

  it('fehlender Token: gar kein verifyOtp, direkt /login', async () => {
    const r = await run({ type: 'recovery', next: '/x' })
    expect(verifyOtpMock).not.toHaveBeenCalled()
    expect(r).toContain('REDIRECT:/login?error=')
  })

  it('nicht erlaubter type: als ungueltig behandelt, kein verifyOtp', async () => {
    const r = await run({ token_hash: 'h1', type: 'signup', next: '/x' })
    expect(verifyOtpMock).not.toHaveBeenCalled()
    expect(r).toContain('REDIRECT:/login?error=')
  })

  it('Open-Redirect-Schutz: protokoll-relatives //evil wird auf / normalisiert', async () => {
    const r = await run({ token_hash: 'h1', type: 'magiclink', next: '//evil.com/phish' })
    expect(r).toBe('REDIRECT:/')
  })

  it('Open-Redirect-Schutz: absolute http-URL wird auf / normalisiert', async () => {
    const r = await run({ token_hash: 'h1', type: 'magiclink', next: 'https://evil.com' })
    expect(r).toBe('REDIRECT:/')
  })
})
