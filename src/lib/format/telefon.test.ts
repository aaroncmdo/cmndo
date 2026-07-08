import { describe, it, expect } from 'vitest'
import { toE164, formatTelefon, telefonHref } from './telefon'

describe('toE164 (kanonische Telefon-Normalisierung)', () => {
  it('null/undefined/leer -> null', () => {
    expect(toE164(null)).toBeNull()
    expect(toE164(undefined)).toBeNull()
    expect(toE164('')).toBeNull()
    expect(toE164('   ')).toBeNull()
    expect(toE164('abc')).toBeNull() // keine Ziffern
  })

  it('bereits +49 -> unveraendert (nur Trenner raus)', () => {
    expect(toE164('+491751234567')).toBe('+491751234567')
    expect(toE164('+49 175 1234567')).toBe('+491751234567')
  })

  it('fuehrende 0 -> +49', () => {
    expect(toE164('01751234567')).toBe('+491751234567')
    expect(toE164('0175/1234-567')).toBe('+491751234567')
  })

  it('KANON-FIX: 00-Praefix -> + (frueher fielen die Inline-Kopien hier auf +49049…)', () => {
    // startsWith('0') haette 00 mitgefangen -> Bug. Kanon prueft 00 ZUERST.
    expect(toE164('00491751234567')).toBe('+491751234567')
    expect(toE164('0044 20 7946 0958')).toBe('+442079460958')
  })

  it('nackte Nummer ohne 0/+ -> als deutsch angenommen (+49)', () => {
    expect(toE164('1751234567')).toBe('+491751234567')
  })
})

describe('formatTelefon (Anzeige)', () => {
  it('gruppiert deutsche Nummern lesbar', () => {
    expect(formatTelefon('01751234567')).toBe('+49 175 1234567')
    expect(formatTelefon('+491751234567')).toBe('+49 175 1234567')
  })
  it('leer/null -> ""', () => {
    expect(formatTelefon(null)).toBe('')
    expect(formatTelefon('')).toBe('')
  })
})

describe('telefonHref (tel:-Link)', () => {
  it('liefert E.164-tel:-Link', () => {
    expect(telefonHref('01751234567')).toBe('tel:+491751234567')
  })
  it('null bei leerer Eingabe', () => {
    expect(telefonHref(null)).toBeNull()
    expect(telefonHref('abc')).toBeNull()
  })
})
