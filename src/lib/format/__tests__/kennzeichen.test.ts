import { describe, it, expect } from 'vitest'
import { formatKennzeichen, maskKennzeichen } from '../kennzeichen'

describe('formatKennzeichen', () => {
  it('null/leer → leer', () => {
    expect(formatKennzeichen(null)).toBe('')
    expect(formatKennzeichen('')).toBe('')
  })

  it('kompakt → K-AB 1234', () => {
    expect(formatKennzeichen('KAB1234')).toBe('K-AB 1234')
  })

  it('mit Leerzeichen', () => {
    expect(formatKennzeichen('K AB 1234')).toBe('K-AB 1234')
  })

  it('lowercase wird uppercased', () => {
    expect(formatKennzeichen('k-ab-1234')).toBe('K-AB 1234')
  })

  it('drei-Buchstaben-Stadt', () => {
    expect(formatKennzeichen('MEIAB123')).toBe('MEI-AB 123')
  })

  it('unrecognisables werden nur uppercased', () => {
    expect(formatKennzeichen('???')).toBe('')
    expect(formatKennzeichen('12345')).toBe('12345')
  })
})

describe('maskKennzeichen', () => {
  it('null → leer', () => {
    expect(maskKennzeichen(null)).toBe('')
  })
  it('K-JB 2025 → K-XX 25', () => {
    expect(maskKennzeichen('K-JB 2025')).toBe('K-XX 25')
  })
  it('KAB1234 wird erst formatiert, dann maskiert', () => {
    expect(maskKennzeichen('KAB1234')).toBe('K-XX 34')
  })
  it('kurze Zahl bleibt unverändert', () => {
    expect(maskKennzeichen('K-AB 1')).toBe('K-XX 1')
  })
})
