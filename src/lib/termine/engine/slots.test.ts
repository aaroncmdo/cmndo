import { describe, it, expect } from 'vitest'
import { slotsFuerTag } from './slots'

describe('slotsFuerTag', () => {
  const tag = new Date('2026-07-06T00:00:00Z') // Montag
  const belegt = (vonHHMM: string, bisHHMM: string) => {
    const mk = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number)
      const d = new Date(tag)
      d.setHours(h, m, 0, 0)
      return d
    }
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
