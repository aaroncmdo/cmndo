import { describe, it, expect } from 'vitest'
import { externalOrigin, externalUrl } from '../external-url'

// Minimal-Mock statt echtem `new Request(...)`: der undici-Request-Konstruktor
// strippt den (forbidden) `host`-Header, den wir hier aber testen wollen.
function mockReq(url: string, headers: Record<string, string> = {}): Request {
  const lower: Record<string, string> = {}
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k]
  return {
    url,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
  } as unknown as Request
}

describe('externalOrigin', () => {
  it('nutzt X-Forwarded-Host + X-Forwarded-Proto (nginx/Prod)', () => {
    // Prod-Bug-Reproduktion: request.url traegt die interne Bind-Adresse,
    // die Forwarded-Header aber die echte Domain.
    const r = mockReq('https://0.0.0.0:3000/api/auth/callback', {
      'x-forwarded-host': 'app.claimondo.de',
      'x-forwarded-proto': 'https',
    })
    expect(externalOrigin(r)).toBe('https://app.claimondo.de')
  })

  it('defaultet Proto auf https wenn nur Forwarded-Host vorhanden ist', () => {
    const r = mockReq('https://0.0.0.0:3000/x', { 'x-forwarded-host': 'app.claimondo.de' })
    expect(externalOrigin(r)).toBe('https://app.claimondo.de')
  })

  it('faellt auf den Host-Header zurueck (https fuer echte Domains)', () => {
    const r = mockReq('https://0.0.0.0:3000/x', { host: 'app.claimondo.de' })
    expect(externalOrigin(r)).toBe('https://app.claimondo.de')
  })

  it('nutzt http fuer localhost-Host (lokaler Dev)', () => {
    const r = mockReq('http://0.0.0.0:3000/x', { host: 'localhost:3000' })
    expect(externalOrigin(r)).toBe('http://localhost:3000')
  })

  it('letzte Reserve: request.url-Origin wenn keine relevanten Header da sind', () => {
    const r = mockReq('http://localhost:3000/x')
    expect(externalOrigin(r)).toBe('http://localhost:3000')
  })

  it('leitet NIE auf die interne 0.0.0.0-Bind-Adresse wenn Forwarded-Header da sind (Regression)', () => {
    const r = mockReq('https://0.0.0.0:3000/api/auth/callback?code=x&next=/kunde/onboarding', {
      'x-forwarded-host': 'app.claimondo.de',
      'x-forwarded-proto': 'https',
      host: '0.0.0.0:3000',
    })
    expect(externalOrigin(r)).not.toContain('0.0.0.0')
    expect(externalOrigin(r)).toBe('https://app.claimondo.de')
  })
})

describe('externalUrl', () => {
  it('baut eine absolute URL auf der externen Origin (nicht 0.0.0.0)', () => {
    const r = mockReq('https://0.0.0.0:3000/api/auth/google-calendar/callback', {
      'x-forwarded-host': 'app.claimondo.de',
      'x-forwarded-proto': 'https',
    })
    expect(externalUrl(r, '/gutachter/profil?gcal=connected').toString()).toBe(
      'https://app.claimondo.de/gutachter/profil?gcal=connected',
    )
  })
})
