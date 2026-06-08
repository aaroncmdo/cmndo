import { describe, it, expect } from 'vitest'
import { verteile2plus1Counts } from '../plane-termin-oeffentlich'

describe('verteile2plus1Counts — 2+1-Verteilung (max 3 Slots, Best 2 + Zweitbester 1)', () => {
  it('Standardfall: Best 2, Zweitbester 1, Rest 0', () => {
    expect(verteile2plus1Counts([2, 3, 4])).toEqual([2, 1, 0])
  })

  it('genug bei drei Kandidaten: 2+1+0 (nie >3 total)', () => {
    expect(verteile2plus1Counts([3, 3, 3])).toEqual([2, 1, 0])
  })

  it('nur 1 Kandidat → bis 3 bei ihm (adaptive Auffuellung)', () => {
    expect(verteile2plus1Counts([5])).toEqual([3])
  })

  it('1 Kandidat mit genau 2 Slots → 2 (keine Phantom-Auffuellung)', () => {
    expect(verteile2plus1Counts([2])).toEqual([2])
  })

  it('Best mit nur 1 Slot → fuellt von den anderen auf', () => {
    expect(verteile2plus1Counts([1, 1, 1])).toEqual([1, 1, 1])
  })

  it('Best ohne Slots → 2+1 wandert auf die naechsten', () => {
    expect(verteile2plus1Counts([0, 2, 1])).toEqual([0, 2, 1])
  })

  it('Luecke in der Mitte: Best 1, Zweiter 0, Dritter fuellt auf', () => {
    expect(verteile2plus1Counts([1, 0, 5])).toEqual([1, 0, 2])
  })

  it('keine Slots irgendwo → alles 0', () => {
    expect(verteile2plus1Counts([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('leere Kandidatenliste → leer', () => {
    expect(verteile2plus1Counts([])).toEqual([])
  })

  it('Summe ueberschreitet nie KUNDE_MAX_SLOTS (3)', () => {
    for (const v of [[9, 9, 9], [5, 5], [10], [4, 0, 0], [0, 9, 9]]) {
      const sum = verteile2plus1Counts(v).reduce((a, b) => a + b, 0)
      expect(sum).toBeLessThanOrEqual(3)
    }
  })
})
