import { describe, it, expect } from 'vitest'
import { localeToBcp47, formatCurrency, formatDate, formatDateTime } from '../format'

// Intl setzt vor das €-Zeichen ein NBSP (U+00A0) bzw. NNBSP (U+202F, neuere ICU)
// — fuer stabile Vergleiche auf ein normales Space (U+0020) normalisieren.
const nb = (s: string): string => s.replace(/[  ]/g, ' ')

describe('localeToBcp47', () => {
  it('mappt alle App-Locales auf regionale BCP-47-Tags', () => {
    expect(localeToBcp47('de')).toBe('de-DE')
    expect(localeToBcp47('en')).toBe('en-GB')
    expect(localeToBcp47('tr')).toBe('tr-TR')
    expect(localeToBcp47('ar')).toBe('ar')
    expect(localeToBcp47('ru')).toBe('ru-RU')
    expect(localeToBcp47('pl')).toBe('pl-PL')
  })
})

describe('formatCurrency', () => {
  it('deutsch: Punkt-Tausender + Komma-Dezimal + Euro hinten', () => {
    expect(nb(formatCurrency(1234.5, 'de'))).toBe('1.234,50 €')
  })
  it('englisch (en-GB): Komma-Tausender + Punkt-Dezimal', () => {
    const s = nb(formatCurrency(1234.5, 'en'))
    expect(s).toContain('1,234.50')
    expect(s).toContain('€')
  })
  it('0 und negative Betraege', () => {
    expect(nb(formatCurrency(0, 'de'))).toBe('0,00 €')
    expect(nb(formatCurrency(-5, 'de'))).toContain('5,00')
  })
})

describe('formatDate', () => {
  // 2026-05-29T10:00:00Z → 12:00 Berlin (CEST, UTC+2) → selber Kalendertag
  const may29 = new Date('2026-05-29T10:00:00Z')

  it('deutsch: dd.mm.yyyy', () => {
    expect(formatDate(may29, 'de')).toBe('29.05.2026')
  })
  it('englisch (en-GB): dd/mm/yyyy', () => {
    expect(formatDate(may29, 'en')).toBe('29/05/2026')
  })
  it('akzeptiert ISO-String', () => {
    expect(formatDate('2026-05-29T10:00:00Z', 'de')).toBe('29.05.2026')
  })
  it('fehlend/ungueltig → leerer String (nie "Invalid Date")', () => {
    expect(formatDate(null, 'de')).toBe('')
    expect(formatDate(undefined, 'de')).toBe('')
    expect(formatDate('', 'de')).toBe('')
    expect(formatDate('kein-datum', 'de')).toBe('')
  })
  it('Berliner Zeitzone greift: 23:00Z am 29. ist in Berlin der 30.', () => {
    // 2026-05-29T23:00:00Z → 01:00 Berlin am 30.05.
    expect(formatDate('2026-05-29T23:00:00Z', 'de')).toBe('30.05.2026')
  })
})

describe('formatDateTime', () => {
  it('enthaelt Datum + Uhrzeit in Berliner Zeit', () => {
    const s = formatDateTime('2026-05-29T10:00:00Z', 'de')
    expect(s).toContain('29.05.2026')
    expect(s).toContain('12:00') // 10:00Z + 2h (CEST)
  })
  it('ungueltig → leer', () => {
    expect(formatDateTime(null, 'de')).toBe('')
  })
})
