import { describe, it, expect } from 'vitest'
import { generateSchadenkarteToken, extractSchadenkarteToken } from './token'

describe('schadenkarte token', () => {
  it('generates SKT-prefixed 16-char tokens', () => {
    const t = generateSchadenkarteToken()
    expect(t).toMatch(/^SKT-[2-9A-HJKMNP-TV-Z]{16}$/)
    expect(generateSchadenkarteToken()).not.toBe(t)
  })
  it('extracts token from a full /schaden URL', () => {
    expect(extractSchadenkarteToken('https://claimondo.de/schaden/SKT-ABCDEFGH23456789')).toBe('SKT-ABCDEFGH23456789')
  })
  it('extracts a bare token (normalises case)', () => {
    expect(extractSchadenkarteToken('skt-abcdefgh23456789')).toBe('SKT-ABCDEFGH23456789')
  })
  it('returns null for non-matches', () => {
    expect(extractSchadenkarteToken('hello world')).toBeNull()
  })
})
