import { describe, it, expect } from 'vitest'
import { PAKET_PRIO, istKontingentBlockiert } from '../findBestSV'

describe('PAKET_PRIO', () => {
  it('Basic hat die unterste Paket-Prio (0)', () => {
    expect(PAKET_PRIO['basic']).toBe(0)
  })
  it('Basic rankt unter standard/pro/premium', () => {
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['standard'])
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['pro'])
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['premium'])
  })
})

describe('istKontingentBlockiert', () => {
  it('Basic wird NIE durch Kontingent ausgesiebt (kalender-basiert)', () => {
    expect(istKontingentBlockiert('basic', 0)).toBe(false)
    expect(istKontingentBlockiert('basic', -3)).toBe(false)
  })
  it('Nicht-Basic wird bei 0/negativem freien Kontingent ausgesiebt', () => {
    expect(istKontingentBlockiert('standard', 0)).toBe(true)
    expect(istKontingentBlockiert('pro', -1)).toBe(true)
  })
  it('Nicht-Basic mit freiem Kontingent bleibt drin', () => {
    expect(istKontingentBlockiert('pro', 5)).toBe(false)
  })
})
