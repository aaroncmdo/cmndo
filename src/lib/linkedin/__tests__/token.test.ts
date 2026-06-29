// src/lib/linkedin/__tests__/token.test.ts
import { describe, it, expect } from 'vitest'
import { isExpired } from '../token'

describe('isExpired', () => {
  const now = new Date('2026-06-29T12:00:00Z').getTime()
  it('true when past expiry', () => {
    expect(isExpired('2026-06-29T11:00:00Z', now)).toBe(true)
  })
  it('true when within the 5-min buffer', () => {
    expect(isExpired('2026-06-29T12:03:00Z', now)).toBe(true)
  })
  it('false when comfortably valid', () => {
    expect(isExpired('2026-06-29T13:00:00Z', now)).toBe(false)
  })
})
