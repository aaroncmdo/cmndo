import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  formatDatum, formatUhrzeit, formatDatumUhrzeit, formatDatumMitWochentag,
} from '../datum'

describe('formatDatum', () => {
  it('null/undefined/leer → leerer String', () => {
    expect(formatDatum(null)).toBe('')
    expect(formatDatum(undefined)).toBe('')
    expect(formatDatum('')).toBe('')
    expect(formatDatum('nicht-ein-datum')).toBe('')
  })

  it('kurz-Stil: 17.04.26', () => {
    expect(formatDatum('2026-04-17T10:00:00Z', 'kurz')).toBe('17.04.26')
  })

  it('lang-Stil enthält Monat als Text', () => {
    const out = formatDatum('2026-04-17T10:00:00Z', 'lang')
    expect(out).toContain('April')
    expect(out).toContain('2026')
  })

  describe('relative', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-17T12:00:00Z'))
    })
    afterAll(() => { vi.useRealTimers() })

    it('heute/morgen/gestern', () => {
      expect(formatDatum('2026-04-17T08:00:00Z', 'relative')).toBe('heute')
      expect(formatDatum('2026-04-18T08:00:00Z', 'relative')).toBe('morgen')
      expect(formatDatum('2026-04-16T08:00:00Z', 'relative')).toBe('gestern')
    })
    it('in N Tagen / vor N Tagen', () => {
      expect(formatDatum('2026-04-20T08:00:00Z', 'relative')).toBe('in 3 Tagen')
      expect(formatDatum('2026-04-14T08:00:00Z', 'relative')).toBe('vor 3 Tagen')
    })
    it('Fallback auf Kurzformat bei großem Abstand', () => {
      expect(formatDatum('2024-01-01T00:00:00Z', 'relative')).toMatch(/^\d{2}\.\d{2}\.\d{2}$/)
    })
  })
})

describe('formatUhrzeit', () => {
  it('null → leer', () => {
    expect(formatUhrzeit(null)).toBe('')
  })
  it('14:30 (Europe/Berlin)', () => {
    // 12:30 UTC = 14:30 Berlin (Sommerzeit)
    expect(formatUhrzeit('2026-04-17T12:30:00Z')).toBe('14:30')
  })
  it('invalid → leer', () => {
    expect(formatUhrzeit('foo')).toBe('')
  })
})

describe('formatDatumUhrzeit', () => {
  it('null → leer', () => {
    expect(formatDatumUhrzeit(null)).toBe('')
  })
  it('enthält Datum + Uhrzeit', () => {
    const out = formatDatumUhrzeit('2026-04-17T12:30:00Z')
    expect(out).toContain('17.04.2026')
    expect(out).toContain('14:30')
  })
})

describe('formatDatumMitWochentag', () => {
  it('null → leer', () => {
    expect(formatDatumMitWochentag(null)).toBe('')
  })
  it('enthält Wochentag-Kurzform', () => {
    // 2026-04-17 ist ein Freitag
    expect(formatDatumMitWochentag('2026-04-17T10:00:00Z')).toMatch(/Fr\.?,.*17\.04\.2026/)
  })
})
