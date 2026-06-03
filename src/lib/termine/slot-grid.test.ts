import { describe, it, expect } from 'vitest'
import {
  buildSlotGrid,
  groupSlotsByDay,
  DEFAULT_SLOT_HOURS,
  DEFAULT_HORIZON_DAYS,
} from './slot-grid'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

describe('AAR-900 buildSlotGrid', () => {
  it('liefert horizonDays × slotHours Slots wenn keine Konflikte', () => {
    const slots = buildSlotGrid([])
    expect(slots.length).toBe(DEFAULT_HORIZON_DAYS * DEFAULT_SLOT_HOURS.length)
    expect(slots.every((s) => s.available)).toBe(true)
  })

  it('markiert kollidierende Slots als unavailable', () => {
    // Konflikt: morgen 9:00 - 10:00 belegt — der 9:00-Slot muss gesperrt sein.
    const morgen = new Date()
    morgen.setHours(0, 0, 0, 0)
    morgen.setDate(morgen.getDate() + 1)
    while (morgen.getDay() === 0 || morgen.getDay() === 6) {
      morgen.setDate(morgen.getDate() + 1)
    }
    // AAR-956 TZ: Konflikt-Instants Berlin-verankert (konsistent zum Grid), tz-robust.
    const dateKey = `${morgen.getFullYear()}-${String(morgen.getMonth() + 1).padStart(2, '0')}-${String(morgen.getDate()).padStart(2, '0')}`
    const start = new Date(berlinWallClockToUtc(`${dateKey}T09:00:00`))
    const end = new Date(berlinWallClockToUtc(`${dateKey}T10:00:00`))

    const slots = buildSlotGrid([
      { start_zeit: start.toISOString(), end_zeit: end.toISOString() },
    ])

    const konfliktSlot = slots.find(
      (s) =>
        new Date(s.startIso).getTime() === start.getTime(),
    )
    expect(konfliktSlot?.available).toBe(false)
  })

  it('akzeptiert custom horizonDays + slotHours', () => {
    const slots = buildSlotGrid([], { horizonDays: 3, slotHours: [10, 14] })
    expect(slots.length).toBe(3 * 2)
    expect(new Set(slots.map((s) => s.zeitLabel))).toEqual(new Set(['10:00', '14:00']))
  })
})

describe('AAR-900 groupSlotsByDay', () => {
  it('gruppiert nach dateKey, Reihenfolge bleibt erhalten', () => {
    const slots = buildSlotGrid([], { horizonDays: 2 })
    const tage = groupSlotsByDay(slots)
    expect(tage.length).toBe(2)
    expect(tage[0].slots.length).toBe(DEFAULT_SLOT_HOURS.length)
    expect(tage[1].slots.length).toBe(DEFAULT_SLOT_HOURS.length)
  })
})
