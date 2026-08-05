import { describe, it, expect } from 'vitest'
import {
  generateResponseToken,
  tokenExpiryFromNow,
  isTokenExpired,
  isRatingValid,
  npsResponsePath,
} from './nps'

describe('generateResponseToken', () => {
  it('erzeugt 64 hex-Zeichen', () => {
    expect(generateResponseToken()).toMatch(/^[0-9a-f]{64}$/)
  })
  it('ist unique über Calls', () => {
    expect(generateResponseToken()).not.toBe(generateResponseToken())
  })
})

describe('tokenExpiryFromNow', () => {
  it('liegt in der Zukunft (default 30d)', () => {
    expect(new Date(tokenExpiryFromNow()).getTime()).toBeGreaterThan(Date.now())
  })
  it('respektiert tageGueltig', () => {
    const sieben = new Date(tokenExpiryFromNow(7)).getTime()
    expect(sieben).toBeGreaterThan(Date.now() + 6 * 864e5)
    expect(sieben).toBeLessThan(Date.now() + 8 * 864e5)
  })
})

describe('isTokenExpired', () => {
  it('null/undefined/ungültig = expired', () => {
    expect(isTokenExpired(null)).toBe(true)
    expect(isTokenExpired(undefined)).toBe(true)
    expect(isTokenExpired('kaputt')).toBe(true)
  })
  it('Vergangenheit = expired, Zukunft = nicht', () => {
    expect(isTokenExpired(new Date(Date.now() - 1000).toISOString())).toBe(true)
    expect(isTokenExpired(new Date(Date.now() + 60000).toISOString())).toBe(false)
  })
})

describe('isRatingValid', () => {
  it('0..10 int = true', () => {
    expect(isRatingValid(0)).toBe(true)
    expect(isRatingValid(10)).toBe(true)
    expect(isRatingValid(7)).toBe(true)
  })
  it('außerhalb / nicht-int / nicht-number = false', () => {
    expect(isRatingValid(-1)).toBe(false)
    expect(isRatingValid(11)).toBe(false)
    expect(isRatingValid(5.5)).toBe(false)
    expect(isRatingValid('3')).toBe(false)
    expect(isRatingValid(Number.NaN)).toBe(false)
    expect(isRatingValid(null)).toBe(false)
  })
})

describe('npsResponsePath', () => {
  it('baut den Pfad', () => {
    expect(npsResponsePath('abc')).toBe('/kunde-nps/abc')
  })
})
