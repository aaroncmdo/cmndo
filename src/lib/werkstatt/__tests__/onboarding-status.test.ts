import { describe, it, expect } from 'vitest'
import { leiteOnboardingStatus } from '../onboarding-status'

describe('leiteOnboardingStatus', () => {
  it('kein Login-Account -> kein_login (warning)', () => {
    const s = leiteOnboardingStatus({ hatLogin: false, forcePasswordChange: null, lastSignInAt: null })
    expect(s.key).toBe('kein_login')
    expect(s.ton).toBe('warning')
  })

  it('schon eingeloggt -> aktiv (success), auch wenn das Flag noch true ist', () => {
    const s = leiteOnboardingStatus({ hatLogin: true, forcePasswordChange: true, lastSignInAt: '2026-07-01T00:00:00Z' })
    expect(s.key).toBe('aktiv')
    expect(s.ton).toBe('success')
  })

  it('eingeladen (Flag true, nie eingeloggt) -> eingeladen (info)', () => {
    const s = leiteOnboardingStatus({ hatLogin: true, forcePasswordChange: true, lastSignInAt: null })
    expect(s.key).toBe('eingeladen')
    expect(s.ton).toBe('info')
  })

  it('Login bereit (Flag false, nie eingeloggt) -> bereit (neutral)', () => {
    const s = leiteOnboardingStatus({ hatLogin: true, forcePasswordChange: false, lastSignInAt: null })
    expect(s.key).toBe('bereit')
    expect(s.ton).toBe('neutral')
  })
})
