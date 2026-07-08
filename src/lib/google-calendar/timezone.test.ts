import { describe, it, expect } from 'vitest'
import { berlinWallClockToUtc, formatBerlin, toBerlinWallClock } from './timezone'

describe('berlinWallClockToUtc', () => {
  it('Sommerzeit (CEST, +2h): 09:00 Berlin -> 07:00Z', () => {
    expect(berlinWallClockToUtc('2026-06-03T09:00:00')).toBe('2026-06-03T07:00:00.000Z')
  })

  it('Winterzeit (CET, +1h): 09:00 Berlin -> 08:00Z', () => {
    expect(berlinWallClockToUtc('2026-01-15T09:00:00')).toBe('2026-01-15T08:00:00.000Z')
  })

  it('akzeptiert Wall-Clock ohne Sekunden', () => {
    expect(berlinWallClockToUtc('2026-06-03T14:30')).toBe('2026-06-03T12:30:00.000Z')
  })

  it('akzeptiert Space-Separator (Postgres-Style)', () => {
    expect(berlinWallClockToUtc('2026-01-15 09:00:00')).toBe('2026-01-15T08:00:00.000Z')
  })

  it('Tag nach der Fruehjahrs-Umstellung ist CEST (+2h)', () => {
    // Umstellung 2026: 29.03. -> ab dann CEST
    expect(berlinWallClockToUtc('2026-03-30T09:00:00')).toBe('2026-03-30T07:00:00.000Z')
  })

  it('Tag nach der Herbst-Umstellung ist CET (+1h)', () => {
    // Umstellung 2026: 25.10. -> ab dann CET
    expect(berlinWallClockToUtc('2026-10-26T09:00:00')).toBe('2026-10-26T08:00:00.000Z')
  })

  it('wirft bei ungueltigem Input', () => {
    expect(() => berlinWallClockToUtc('quatsch')).toThrow()
  })

  it('Round-Trip Sommer: toBerlinWallClock(berlinWallClockToUtc(x)) === x', () => {
    const wall = '2026-06-03T09:00:00'
    expect(toBerlinWallClock(berlinWallClockToUtc(wall))).toBe(wall)
  })

  it('Round-Trip Winter', () => {
    const wall = '2026-01-15T17:45:00'
    expect(toBerlinWallClock(berlinWallClockToUtc(wall))).toBe(wall)
  })
})

describe('toBerlinWallClock (Google-Sync-Payload — Berlin-Wall statt UTC)', () => {
  it('Sommer (CEST, +2h): 07:00Z -> 09:00 Berlin-Wall ohne Offset', () => {
    expect(toBerlinWallClock('2026-06-03T07:00:00.000Z')).toBe('2026-06-03T09:00:00')
  })
  it('Winter (CET, +1h): 08:00Z -> 09:00 Berlin-Wall', () => {
    expect(toBerlinWallClock('2026-01-15T08:00:00.000Z')).toBe('2026-01-15T09:00:00')
  })
})

describe('formatBerlin', () => {
  it('Sommer: 07:00Z -> "09:00" (Berlin)', () => {
    expect(formatBerlin('2026-06-03T07:00:00.000Z', { hour: '2-digit', minute: '2-digit' })).toBe('09:00')
  })

  it('Winter: 08:00Z -> "09:00" (Berlin)', () => {
    expect(formatBerlin('2026-01-15T08:00:00.000Z', { hour: '2-digit', minute: '2-digit' })).toBe('09:00')
  })
})
