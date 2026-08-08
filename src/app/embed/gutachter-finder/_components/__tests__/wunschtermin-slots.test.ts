import { describe, it, expect } from 'vitest'
import { zukunftsZeiten, naechsteWerktage } from '../wunschtermin-slots'

// Local-Konstruktor + local-Getter der Logik sind symmetrisch -> diese Tests sind TZ-agnostisch
// (ein `new Date(2026, 7, 8, 12, 30)` hat getHours()===12 in JEDER Runner-TZ).
const ZEITEN = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

describe('zukunftsZeiten', () => {
  it('kuenftiges Datum -> alle Zeiten', () => {
    expect(zukunftsZeiten(ZEITEN, '2026-08-11', '2026-08-08', 12)).toEqual(ZEITEN)
  })

  it('heute 12:30 -> nur Stunden > 12 (kein vergangener/laufender Slot)', () => {
    expect(zukunftsZeiten(ZEITEN, '2026-08-08', '2026-08-08', 12)).toEqual([
      '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    ])
  })

  it('heute frueh (07:xx) -> alle Zeiten bleiben', () => {
    expect(zukunftsZeiten(ZEITEN, '2026-08-08', '2026-08-08', 7)).toEqual(ZEITEN)
  })

  it('heute nach dem letzten Slot (18:xx) -> leer', () => {
    expect(zukunftsZeiten(ZEITEN, '2026-08-08', '2026-08-08', 18)).toEqual([])
  })
})

describe('naechsteWerktage', () => {
  it('Samstag 12:30 -> heute (Sa) dabei mit Zukunfts-Slots, kein Sonntag, 14 Tage', () => {
    // 08.08.2026 = Samstag, 09.08. = Sonntag.
    const { tage, todayIso, nowHour } = naechsteWerktage(new Date(2026, 7, 8, 12, 30), ZEITEN, 14)
    expect(todayIso).toBe('2026-08-08')
    expect(nowHour).toBe(12)
    expect(tage[0].iso).toBe('2026-08-08') // heute ist dabei (13-18 Uhr noch frei)
    expect(tage[0].wtag).toBe('Sa')
    expect(tage).toHaveLength(14)
    expect(tage.some((t) => t.iso === '2026-08-09')).toBe(false) // Sonntag raus
    expect(tage[1].iso).toBe('2026-08-10') // Montag
  })

  it('heute ausgebucht (18:30) -> heute faellt raus, erster Tag ist morgen', () => {
    const { tage } = naechsteWerktage(new Date(2026, 7, 8, 18, 30), ZEITEN, 14)
    expect(tage.some((t) => t.iso === '2026-08-08')).toBe(false)
    expect(tage[0].iso).toBe('2026-08-10') // 09. = So -> Mo 10.
    expect(tage).toHaveLength(14)
  })

  it('Sonntag -> heute (So) faellt raus (getDay 0), Start Montag', () => {
    // 09.08.2026 = Sonntag.
    const { tage, todayIso } = naechsteWerktage(new Date(2026, 7, 9, 10, 0), ZEITEN, 14)
    expect(todayIso).toBe('2026-08-09')
    expect(tage[0].iso).toBe('2026-08-10')
    expect(tage.every((t) => t.wtag !== 'So')).toBe(true)
  })

  it('Format: tag = "DD.MM.", 14 Werktage ohne Sonntage', () => {
    const { tage } = naechsteWerktage(new Date(2026, 7, 10, 9, 0), ZEITEN, 14) // Montag
    expect(tage[0].tag).toBe('10.08.')
    expect(tage.every((t) => /^\d{2}\.\d{2}\.$/.test(t.tag))).toBe(true)
    expect(tage.every((t) => t.wtag !== 'So')).toBe(true)
  })
})
