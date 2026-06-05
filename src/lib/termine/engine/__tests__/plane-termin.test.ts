import { describe, it, expect } from 'vitest'
import { passtZuWunschzeit, verteileAusSlots } from '../plane-termin'
import type { PersonKandidat } from '../matching'

const kand = (id: string): PersonKandidat => ({
  assignee: { typ: 'sachverstaendiger', id }, name: id, score: 0, distanzKm: 0,
  etaVomBueroMin: null, slotVon: null, slotBis: null, reasons: [],
})
const slot = (h: number) => ({
  von: `2026-06-10T${String(h).padStart(2, '0')}:00:00Z`,
  bis: `2026-06-10T${String(h).padStart(2, '0')}:40:00Z`,
})

describe('passtZuWunschzeit (Sub-A2)', () => {
  it('ohne Filter passt alles', () => {
    expect(passtZuWunschzeit({ datum: '2026-06-10', uhrzeit: '09:00' }, null)).toBe(true)
  })
  it('Tag filtert exakt', () => {
    expect(passtZuWunschzeit({ datum: '2026-06-10', uhrzeit: '09:00' }, { tag: '2026-06-10' })).toBe(true)
    expect(passtZuWunschzeit({ datum: '2026-06-11', uhrzeit: '09:00' }, { tag: '2026-06-10' })).toBe(false)
  })
  it('Zeitfenster filtert', () => {
    expect(passtZuWunschzeit({ datum: '2026-06-10', uhrzeit: '08:00' }, { vonUhr: '09:00', bisUhr: '12:00' })).toBe(false)
    expect(passtZuWunschzeit({ datum: '2026-06-10', uhrzeit: '10:00' }, { vonUhr: '09:00', bisUhr: '12:00' })).toBe(true)
    expect(passtZuWunschzeit({ datum: '2026-06-10', uhrzeit: '13:00' }, { vonUhr: '09:00', bisUhr: '12:00' })).toBe(false)
  })
})

describe('verteileAusSlots — 2+1 adaptiv (Sub-A2, Aarons Kernpunkt)', () => {
  it('Default: 2 vom Best + 1 vom Zweitbesten', () => {
    const r = verteileAusSlots([
      { k: kand('A'), slots: [slot(9), slot(10), slot(11)] },
      { k: kand('B'), slots: [slot(9), slot(10)] },
    ])
    expect(r.map((v) => v.assignee.id)).toEqual(['A', 'A', 'B'])
  })
  it('Nur 1 Kandidat → 3 bei ihm', () => {
    const r = verteileAusSlots([{ k: kand('A'), slots: [slot(9), slot(10), slot(11), slot(12)] }])
    expect(r.map((v) => v.assignee.id)).toEqual(['A', 'A', 'A'])
  })
  it('Best hat nur 1 Slot → 1 Best + Rest vom Zweit', () => {
    const r = verteileAusSlots([
      { k: kand('A'), slots: [slot(9)] },
      { k: kand('B'), slots: [slot(9), slot(10)] },
    ])
    expect(r.map((v) => v.assignee.id)).toEqual(['A', 'B', 'B'])
  })
  it('<3 verfügbar → weniger (graceful)', () => {
    const r = verteileAusSlots([{ k: kand('A'), slots: [slot(9)] }])
    expect(r).toHaveLength(1)
  })
})
