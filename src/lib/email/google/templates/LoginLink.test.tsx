import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { LoginLinkEmail, subject } from './LoginLink'

describe('LoginLinkEmail', () => {
  it('Betreff nennt die Anmeldung, Link steht im Button', async () => {
    expect(subject({ vorname: 'Kai', actionUrl: 'https://x/y' })).toBe('Ihr Anmelde-Link für Claimondo')
    const html = await render(LoginLinkEmail({ vorname: 'Kai', actionUrl: 'https://app.claimondo.de/auth/bestaetigen?token_hash=abc' }))
    expect(html).toContain('Hallo Kai,')
    expect(html).toContain('token_hash=abc')
    expect(html).toContain('Jetzt anmelden')
  })
  it('ohne Vornamen neutrale Anrede', async () => {
    const html = await render(LoginLinkEmail({ vorname: null, actionUrl: 'https://x/y' }))
    expect(html).toContain('Hallo,')
  })
})
