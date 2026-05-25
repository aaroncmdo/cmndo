import { describe, it, expect, afterEach, vi } from 'vitest'
import { isTrackingHost } from '../consent'

describe('isTrackingHost', () => {
  it('allows the marketing apex domain', () => {
    expect(isTrackingHost('claimondo.de')).toBe(true)
  })
  it('allows www', () => {
    expect(isTrackingHost('www.claimondo.de')).toBe(true)
  })
  it('strips a port before matching', () => {
    expect(isTrackingHost('claimondo.de:443')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(isTrackingHost('Claimondo.DE')).toBe(true)
  })
  it('rejects portal + funnel subdomains', () => {
    for (const h of [
      'app.claimondo.de',
      'gutachter.claimondo.de',
      'makler.claimondo.de',
      'kfzgutachter.claimondo.de',
      'schaden.claimondo.de',
      'app.staging.claimondo.de',
    ]) {
      expect(isTrackingHost(h)).toBe(false)
    }
  })
  it('rejects null/undefined/empty', () => {
    expect(isTrackingHost(null)).toBe(false)
    expect(isTrackingHost(undefined)).toBe(false)
    expect(isTrackingHost('')).toBe(false)
  })
})

describe('isTrackingHost localhost dev-seam', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('allows localhost in non-production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isTrackingHost('localhost:3000')).toBe(true)
    expect(isTrackingHost('127.0.0.1')).toBe(true)
  })
  it('rejects localhost in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isTrackingHost('localhost:3000')).toBe(false)
  })
})
