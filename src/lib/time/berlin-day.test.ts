import { describe, it, expect } from 'vitest'
import { berlinIsoDate, berlinDayRangeUtc, berlinDayRangeForIsoDates } from './berlin-day'

describe('berlinIsoDate', () => {
  it('gibt den Berliner Kalendertag zurueck, auch wenn UTC noch der Vortag ist', () => {
    // 2026-07-07 23:22 UTC == 2026-07-08 01:22 Berlin (Sommerzeit, +2)
    expect(berlinIsoDate(new Date('2026-07-07T23:22:00Z'))).toBe('2026-07-08')
  })

  it('gibt im Winter den korrekten Berliner Tag zurueck', () => {
    // 2026-01-15 10:00 UTC == 11:00 Berlin (+1)
    expect(berlinIsoDate(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15')
  })
})

describe('berlinDayRangeUtc', () => {
  it('Sommer: Fenster ist die Berliner Kalendertag-Grenze (der Bug-Fall)', () => {
    // Genau die reale Situation: jetzt 2026-07-07 23:22 UTC (= 08.07. 01:22 Berlin).
    // Der Tagesmodus soll den 08.07. (Berlin) zeigen, nicht den 07.
    const r = berlinDayRangeUtc(new Date('2026-07-07T23:22:00Z'))
    expect(r.isoDate).toBe('2026-07-08')
    expect(r.startUtc.toISOString()).toBe('2026-07-07T22:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-07-08T22:00:00.000Z')
  })

  it('Sommer: ein Termin um 08:00Z am Berliner Tag liegt im Fenster', () => {
    // smoke-sv Termin real: 2026-07-08 08:00Z (= 10:00 Berlin)
    const r = berlinDayRangeUtc(new Date('2026-07-07T23:22:00Z'))
    const termin = new Date('2026-07-08T08:00:00Z').getTime()
    expect(termin).toBeGreaterThanOrEqual(r.startUtc.getTime())
    expect(termin).toBeLessThan(r.endUtc.getTime())
  })

  it('Winter: Fenster spannt 24h um den Berliner Tag (+1)', () => {
    const r = berlinDayRangeUtc(new Date('2026-01-15T10:00:00Z'))
    expect(r.isoDate).toBe('2026-01-15')
    expect(r.startUtc.toISOString()).toBe('2026-01-14T23:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-01-15T23:00:00.000Z')
  })

  it('DST Fruehjahr (Umstellung 29.03.2026): Tag ist 23h lang', () => {
    const r = berlinDayRangeUtc(new Date('2026-03-29T12:00:00Z'))
    expect(r.isoDate).toBe('2026-03-29')
    expect(r.startUtc.toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-03-29T22:00:00.000Z')
    const hours = (r.endUtc.getTime() - r.startUtc.getTime()) / 3_600_000
    expect(hours).toBe(23)
  })

  it('DST Herbst (Umstellung 25.10.2026): Tag ist 25h lang', () => {
    const r = berlinDayRangeUtc(new Date('2026-10-25T12:00:00Z'))
    expect(r.isoDate).toBe('2026-10-25')
    expect(r.startUtc.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-10-25T23:00:00.000Z')
    const hours = (r.endUtc.getTime() - r.startUtc.getTime()) / 3_600_000
    expect(hours).toBe(25)
  })
})

describe('berlinDayRangeForIsoDates', () => {
  it('Single-Tag Sommer: [von 00:00 Berlin, bis+1 00:00 Berlin)', () => {
    const r = berlinDayRangeForIsoDates('2026-07-08', '2026-07-08')
    expect(r.startUtc.toISOString()).toBe('2026-07-07T22:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-07-08T22:00:00.000Z')
  })

  it('Mehrtags-Bereich Winter: von-Start bis (bis+1)-Start, inklusiv bis', () => {
    const r = berlinDayRangeForIsoDates('2026-01-15', '2026-01-16')
    expect(r.startUtc.toISOString()).toBe('2026-01-14T23:00:00.000Z')
    expect(r.endUtc.toISOString()).toBe('2026-01-16T23:00:00.000Z')
  })
})
