import { describe, it, expect } from 'vitest'
import { letzterReminderAm } from '@/lib/abrechnungen/reminder-recency'

describe('letzterReminderAm', () => {
  it('returns null for empty array', () => {
    expect(letzterReminderAm([])).toBeNull()
  })

  it('returns null when all versendet_am are null', () => {
    expect(letzterReminderAm([{ versendet_am: null }, { versendet_am: null }])).toBeNull()
  })

  it('returns the single non-null ISO string', () => {
    const result = letzterReminderAm([{ versendet_am: '2026-07-01T07:00:00.000Z' }])
    expect(result).toBe('2026-07-01T07:00:00.000Z')
  })

  it('returns the later of two ISO timestamps', () => {
    const earlier = '2026-07-01T07:00:00.000Z'
    const later = '2026-07-08T07:00:00.000Z'
    expect(letzterReminderAm([
      { versendet_am: earlier },
      { versendet_am: later },
    ])).toBe(later)
  })

  it('returns the later ISO even when order is reversed', () => {
    const earlier = '2026-06-20T07:00:00.000Z'
    const later = '2026-07-10T07:00:00.000Z'
    expect(letzterReminderAm([
      { versendet_am: later },
      { versendet_am: earlier },
    ])).toBe(later)
  })

  it('skips null entries and returns max of the rest', () => {
    expect(letzterReminderAm([
      { versendet_am: null },
      { versendet_am: '2026-07-05T07:00:00.000Z' },
      { versendet_am: null },
    ])).toBe('2026-07-05T07:00:00.000Z')
  })
})
