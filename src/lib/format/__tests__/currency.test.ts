import { describe, it, expect } from 'vitest'
import { formatEUR, formatEURKompakt, formatEURausEuro } from '../currency'

describe('formatEUR', () => {
  it('null/undefined/NaN → leer', () => {
    expect(formatEUR(null)).toBe('')
    expect(formatEUR(undefined)).toBe('')
    expect(formatEUR(NaN)).toBe('')
    expect(formatEUR(Infinity)).toBe('')
  })

  it('443500 Cents → 4.435,00 €', () => {
    // NBSP als Trennzeichen (Intl-Output), deshalb nur Substrings prüfen
    const out = formatEUR(443500)
    expect(out).toMatch(/4\.435,00\s*€/)
  })

  it('0 Cents → 0,00 €', () => {
    const out = formatEUR(0)
    expect(out).toMatch(/0,00\s*€/)
  })

  it('rundet Dezimalwerte', () => {
    const out = formatEUR(100.6)
    expect(out).toMatch(/1,01\s*€/)
  })
})

describe('formatEURKompakt', () => {
  it('null → leer', () => {
    expect(formatEURKompakt(null)).toBe('')
  })
  it('443500 → 4.435 €', () => {
    const out = formatEURKompakt(443500)
    expect(out).toMatch(/4\.435\s*€/)
    expect(out).not.toMatch(/,/)
  })
  it('99 Cents → 1 €', () => {
    const out = formatEURKompakt(99)
    expect(out).toMatch(/1\s*€/)
  })
})

describe('formatEURausEuro', () => {
  it('null → leer', () => {
    expect(formatEURausEuro(null)).toBe('')
  })
  it('4435 → 4.435,00 €', () => {
    const out = formatEURausEuro(4435)
    expect(out).toMatch(/4\.435,00\s*€/)
  })
  it('4435.5 → 4.435,50 €', () => {
    const out = formatEURausEuro(4435.5)
    expect(out).toMatch(/4\.435,50\s*€/)
  })
})
