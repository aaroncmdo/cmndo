import { describe, it, expect } from 'vitest'
import { naechsterAktiverStep, berechneNextSendAt } from '../advance'

const steps = [
  { position: 1, offset_tage: 0, aktiv: true },
  { position: 2, offset_tage: 3, aktiv: true },
  { position: 5, offset_tage: 13, aktiv: false }, // Bonus aus
  { position: 6, offset_tage: 20, aktiv: true },
]

describe('advance', () => {
  it('ueberspringt inaktive Steps (5 aktiv=false -> 6)', () => {
    expect(naechsterAktiverStep(steps, 2)?.position).toBe(6)
  })
  it('erster Step ab 0', () => {
    expect(naechsterAktiverStep(steps, 0)?.position).toBe(1)
  })
  it('null wenn keiner mehr', () => {
    expect(naechsterAktiverStep(steps, 6)).toBeNull()
  })
  it('absolute next_send_at ab Anker', () => {
    const anker = new Date('2026-01-01T00:00:00Z')
    expect(berechneNextSendAt(anker, { position: 2, offset_tage: 3, aktiv: true }).toISOString()).toBe('2026-01-04T00:00:00.000Z')
  })
})
