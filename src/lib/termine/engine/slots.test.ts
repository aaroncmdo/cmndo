import { describe, it, expect } from 'vitest'
import { slotsFuerTag } from './slots'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

describe('slotsFuerTag', () => {
  const tag = new Date('2026-07-06T00:00:00Z') // Montag
  // AAR-956 TZ: Belegt-Instants Berlin-verankert (konsistent zur Slot-Generierung),
  // damit der Test runner-TZ-unabhaengig ist (CI UTC vs lokal Berlin).
  const belegt = (vonHHMM: string, bisHHMM: string) => {
    const mk = (hhmm: string) => new Date(berlinWallClockToUtc(`2026-07-06T${hhmm}:00`))
    return { von: mk(vonHHMM), bis: mk(bisHHMM) }
  }
  it('erzeugt 45-Min-Slots 09:00–11:00 (puffer 0, keine Belegung)', () => {
    expect(slotsFuerTag(tag, { vonMin: 540, bisMin: 660 }, [], 45, 0).map((s) => s.uhrzeit)).toEqual([
      '09:00',
      '09:45',
    ])
  })
  it('lässt einen direkt belegten Slot aus (puffer 0)', () => {
    expect(
      slotsFuerTag(tag, { vonMin: 540, bisMin: 720 }, [belegt('09:45', '10:30')], 45, 0).map((s) => s.uhrzeit),
    ).toEqual(['09:00', '10:30', '11:15'])
  })
  it('puffer blockt angrenzende Slots', () => {
    expect(
      slotsFuerTag(tag, { vonMin: 540, bisMin: 720 }, [belegt('10:30', '11:15')], 45, 15).map((s) => s.uhrzeit),
    ).toEqual(['09:00'])
  })
})
