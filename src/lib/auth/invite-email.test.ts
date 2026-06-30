import { describe, it, expect } from 'vitest'
import { einladungEmailHtml } from './invite-email'

// AAR-auth-haertung (Befund F): Staff-/Makler-Einladungen enthielten das
// Klartext-Passwort im Email-Body (Email = geloggter/weitergeleiteter/at-rest
// gespeicherter Kanal). Jetzt: Recovery-Magic-Link statt Passwort.

describe('einladungEmailHtml', () => {
  it('bettet den Magic-Link ein und enthaelt KEIN Klartext-Passwort', () => {
    const html = einladungEmailHtml({
      vorname: 'Max',
      email: 'max@b.de',
      introHtml: '<p>Sie wurden als Dispatcher eingeladen.</p>',
      magicLink: 'https://app.claimondo.de/verify?token=abc123',
      appUrl: 'https://app.claimondo.de',
    })
    expect(html).toContain('https://app.claimondo.de/verify?token=abc123')
    expect(html).toContain('Max')
    expect(html).toContain('Dispatcher')
    expect(html.toLowerCase()).not.toContain('einmalpasswort')
    expect(html.toLowerCase()).not.toContain('passwort:')
  })

  it('Fallback ohne Link verweist auf Login + Passwort-vergessen, niemals ein Passwort', () => {
    const html = einladungEmailHtml({
      vorname: 'Max',
      email: 'max@b.de',
      introHtml: '<p>intro</p>',
      magicLink: null,
      appUrl: 'https://app.claimondo.de',
    })
    expect(html).toContain('https://app.claimondo.de/login')
    expect(html.toLowerCase()).toContain('passwort vergessen')
    expect(html.toLowerCase()).not.toContain('einmalpasswort')
  })
})
