import { describe, it, expect } from 'vitest'
import { msTokenNeedsRefresh } from '../graph-client'

describe('msTokenNeedsRefresh', () => {
  const now = 1_000_000_000_000
  it('kein Ablauf → true', () => {
    expect(msTokenNeedsRefresh(null, now)).toBe(true)
  })
  it('abgelaufen → true', () => {
    expect(msTokenNeedsRefresh(new Date(now - 1000).toISOString(), now)).toBe(true)
  })
  it('gültig (> now+60s Puffer) → false', () => {
    expect(msTokenNeedsRefresh(new Date(now + 120_000).toISOString(), now)).toBe(false)
  })
  it('innerhalb Puffer (< 60s) → true', () => {
    expect(msTokenNeedsRefresh(new Date(now + 30_000).toISOString(), now)).toBe(true)
  })
})
