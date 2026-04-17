import { describe, it, expect } from 'vitest'
import { formatTelefon, telefonHref } from '../telefon'

describe('formatTelefon', () => {
  it('null/leer → leer', () => {
    expect(formatTelefon(null)).toBe('')
    expect(formatTelefon('')).toBe('')
    expect(formatTelefon('   ')).toBe('')
  })

  it('E.164 → +49 175 1234567', () => {
    expect(formatTelefon('+491751234567')).toBe('+49 175 1234567')
  })

  it('0-Präfix wird zu +49', () => {
    expect(formatTelefon('01751234567')).toBe('+49 175 1234567')
  })

  it('Sonderzeichen werden entfernt', () => {
    expect(formatTelefon('0175/1234-567')).toBe('+49 175 1234567')
    expect(formatTelefon('(0175) 1234 567')).toBe('+49 175 1234567')
  })

  it('00-Präfix für international', () => {
    expect(formatTelefon('00491751234567')).toBe('+49 175 1234567')
  })
})

describe('telefonHref', () => {
  it('null → null', () => {
    expect(telefonHref(null)).toBeNull()
    expect(telefonHref('')).toBeNull()
  })

  it('liefert tel:+E164', () => {
    expect(telefonHref('01751234567')).toBe('tel:+491751234567')
    expect(telefonHref('+491751234567')).toBe('tel:+491751234567')
  })

  it('strippt Sonderzeichen', () => {
    expect(telefonHref('0175 / 123-4567')).toBe('tel:+4901751234567'.replace('01', '1'))
    // stabiler: nur Präfix prüfen
    expect(telefonHref('0175 / 123-4567')?.startsWith('tel:+49')).toBe(true)
  })
})
