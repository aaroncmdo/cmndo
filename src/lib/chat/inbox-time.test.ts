import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatInboxTime } from './inbox-time'

describe('formatInboxTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fixe "Jetzt"-Zeit: Di, 2026-06-02 12:00 (lokal).
    vi.setSystemTime(new Date(2026, 5, 2, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('liefert "—" fuer leeren Timestamp (leerer Thread ohne Nachricht)', () => {
    expect(formatInboxTime('')).toBe('—')
  })

  it('liefert "—" fuer ungueltigen Timestamp statt "Invalid Date"', () => {
    expect(formatInboxTime('nonsense')).toBe('—')
  })

  it('zeigt die Uhrzeit fuer eine heutige Aktivitaet', () => {
    const res = formatInboxTime(new Date(2026, 5, 2, 9, 30, 0).toISOString())
    expect(res).toMatch(/^\d{2}:\d{2}$/)
  })

  it('zeigt ein echtes Datum fuer aeltere Aktivitaet (nie "Invalid Date")', () => {
    const res = formatInboxTime(new Date(2026, 4, 1, 9, 30, 0).toISOString())
    expect(res).not.toBe('Invalid Date')
    expect(res).not.toBe('—')
    expect(res.length).toBeGreaterThan(0)
  })
})
