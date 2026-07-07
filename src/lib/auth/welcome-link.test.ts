// Regressions-Guard fuer den token_hash-Welcome-Link-Helper. Fixiert das URL-Format
// (/api/auth/confirm?token_hash=…&type=…&next=…) und die null-Faelle (Caller schickt dann
// die Mail ohne Magic-Link-Button / mit Einmalpasswort-Fallback).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateLinkMock } = vi.hoisted(() => ({ generateLinkMock: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink: generateLinkMock } } }),
}))

import { buildWelcomeConfirmLink } from './welcome-link'

describe('buildWelcomeConfirmLink', () => {
  beforeEach(() => generateLinkMock.mockReset())

  it('baut eine /api/auth/confirm-URL mit token_hash + type + encoded next', async () => {
    generateLinkMock.mockResolvedValue({ data: { properties: { hashed_token: 'abc123' } }, error: null })
    const link = await buildWelcomeConfirmLink('x@y.de', 'recovery', '/passwort-zuruecksetzen')
    expect(link).toContain('/api/auth/confirm')
    expect(link).toContain('token_hash=abc123')
    expect(link).toContain('type=recovery')
    expect(link).toContain('next=%2Fpasswort-zuruecksetzen')
    // generateLink OHNE redirectTo (wir nutzen hashed_token, nicht den action_link)
    expect(generateLinkMock).toHaveBeenCalledWith({ type: 'recovery', email: 'x@y.de' })
  })

  it('gibt null zurueck bei generateLink-Fehler', async () => {
    generateLinkMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await buildWelcomeConfirmLink('x@y.de', 'magiclink', '/kunde/onboarding')).toBeNull()
  })

  it('gibt null zurueck wenn kein hashed_token geliefert wird', async () => {
    generateLinkMock.mockResolvedValue({ data: { properties: {} }, error: null })
    expect(await buildWelcomeConfirmLink('x@y.de', 'magiclink', '/kunde/onboarding')).toBeNull()
  })
})
