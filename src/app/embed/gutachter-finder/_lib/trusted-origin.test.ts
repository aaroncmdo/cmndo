import { describe, it, expect } from 'vitest'
import { isTrustedParentOrigin } from './trusted-origin'

describe('isTrustedParentOrigin (Consent-Bridge Origin-Allowlist)', () => {
  it('akzeptiert claimondo.de + Subdomains (prod + staging)', () => {
    for (const o of [
      'https://claimondo.de',
      'https://www.claimondo.de',
      'https://app.claimondo.de',
      'https://kfzgutachter.claimondo.de',
      'https://app.staging.claimondo.de',
    ]) {
      expect(isTrustedParentOrigin(o)).toBe(true)
    }
  })

  it('akzeptiert localhost/127.0.0.1 (dev)', () => {
    expect(isTrustedParentOrigin('http://localhost:3000')).toBe(true)
    expect(isTrustedParentOrigin('http://127.0.0.1:3006')).toBe(true)
  })

  it('lehnt fremde Origins + Suffix-Angriffe + Müll ab', () => {
    for (const o of [
      'https://evil.com',
      'https://evilclaimondo.de', // Suffix-Angriff (kein führender Punkt)
      'https://claimondo.de.evil.com', // Präfix-Spoof
      'https://claimondo-de.evil.com',
      'null',
      '',
      'not-a-url',
    ]) {
      expect(isTrustedParentOrigin(o)).toBe(false)
    }
  })
})
