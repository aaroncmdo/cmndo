import { describe, it, expect } from 'vitest'
import { normalizeDedupKey, dedupKeyIsUsable } from './dedup-key'

describe('normalizeDedupKey', () => {
  it('trimmt + lowercased email, leere Strings -> null', () => {
    expect(normalizeDedupKey({ telefon: ' 0170 1 ', email: ' A@B.DE ', kennzeichen: '' })).toEqual({
      telefon: '0170 1',
      email: 'a@b.de',
      kennzeichen: null,
    })
  })
  it('undefined/null -> null', () => {
    expect(normalizeDedupKey({})).toEqual({ telefon: null, email: null, kennzeichen: null })
  })
})

describe('dedupKeyIsUsable', () => {
  it('braucht Person (telefon|email) UND kennzeichen', () => {
    expect(dedupKeyIsUsable({ telefon: '0170', email: null, kennzeichen: 'B-XX 1' })).toBe(true)
    expect(dedupKeyIsUsable({ telefon: null, email: 'a@b.de', kennzeichen: 'B-XX 1' })).toBe(true)
    // keine Schadenkennung -> nicht nutzbar
    expect(dedupKeyIsUsable({ telefon: '0170', email: null, kennzeichen: null })).toBe(false)
    // keine Person -> nicht nutzbar
    expect(dedupKeyIsUsable({ telefon: null, email: null, kennzeichen: 'B-XX 1' })).toBe(false)
  })
})
