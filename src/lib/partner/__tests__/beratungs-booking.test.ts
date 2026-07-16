import { describe, it, expect } from 'vitest'
import { generiereBeratungsSlotStarts, BERATUNG_VORLAUF_H } from '../beratungs-booking'
import { ONBOARDING_TERMIN_DAUER_MIN } from '../onboarding-termin'

const berlin = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(d)

describe('generiereBeratungsSlotStarts — Angebots-Raster', () => {
  // Fixer Anker: Mi 2026-07-15 10:00 Berlin (Sommerzeit) als nowMs.
  const now = Date.parse('2026-07-15T08:00:00.000Z')
  const slots = generiereBeratungsSlotStarts(now)

  it('liefert Slots und respektiert den Vorlauf', () => {
    expect(slots.length).toBeGreaterThan(0)
    const earliest = now + BERATUNG_VORLAUF_H * 60 * 60 * 1000
    for (const s of slots) expect(s.getTime()).toBeGreaterThanOrEqual(earliest)
  })

  it('nur Werktage (Berlin), 30-min-Raster, Fenster 09:00-16:30', () => {
    for (const s of slots) {
      const wochentag = berlin(s, { weekday: 'short' })
      expect(['Mo', 'Di', 'Mi', 'Do', 'Fr']).toContain(wochentag.replace('.', ''))
      const [hh, mm] = berlin(s, { hour: '2-digit', minute: '2-digit', hour12: false })
        .split(':')
        .map(Number)
      expect(mm % ONBOARDING_TERMIN_DAUER_MIN).toBe(0)
      // Letzter 30-min-Slot im 9-17-Fenster startet 16:30.
      expect(hh).toBeGreaterThanOrEqual(9)
      expect(hh * 60 + mm).toBeLessThanOrEqual(16 * 60 + 30)
    }
  })

  it('aufsteigend sortiert + eindeutig', () => {
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime())
    }
  })

  it('Wochenende faellt raus (Sa/So des Ankerzeitraums enthalten keine Slots)', () => {
    const tage = new Set(slots.map((s) => berlin(s, { weekday: 'short' }).replace('.', '')))
    expect(tage.has('Sa')).toBe(false)
    expect(tage.has('So')).toBe(false)
  })
})
