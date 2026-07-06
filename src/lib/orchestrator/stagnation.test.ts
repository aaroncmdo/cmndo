import { describe, it, expect } from 'vitest'
import { isStagnant, STAGNATION } from './stagnation'

const NOW = new Date('2026-07-05T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

describe('isStagnant', () => {
  it('(a) flaggt istAktiv-Fall ohne Aktivitaet ueber der Schwelle', () => {
    expect(
      isStagnant(
        { istAktiv: true, abgeschlossenAm: null, letzteAktivitaetAm: daysAgo(6) },
        NOW,
      ),
    ).toBe(true)
  })

  it('(b) flaggt NICHT wenn Aktivitaet juenger als Schwelle', () => {
    expect(
      isStagnant(
        { istAktiv: true, abgeschlossenAm: null, letzteAktivitaetAm: daysAgo(2) },
        NOW,
      ),
    ).toBe(false)
  })

  it('(c) flaggt NICHT wenn !istAktiv, egal wie alt', () => {
    expect(
      isStagnant(
        { istAktiv: false, abgeschlossenAm: null, letzteAktivitaetAm: daysAgo(90) },
        NOW,
      ),
    ).toBe(false)
  })

  it('(d) flaggt NICHT wenn abgeschlossenAm gesetzt', () => {
    expect(
      isStagnant(
        { istAktiv: true, abgeschlossenAm: daysAgo(10), letzteAktivitaetAm: daysAgo(90) },
        NOW,
      ),
    ).toBe(false)
  })

  it('(e) flaggt bei letzteAktivitaetAm=null + istAktiv', () => {
    expect(
      isStagnant(
        { istAktiv: true, abgeschlossenAm: null, letzteAktivitaetAm: null },
        NOW,
      ),
    ).toBe(true)
  })

  it('STAGNATION.tageSchwelle ist 5', () => {
    expect(STAGNATION.tageSchwelle).toBe(5)
  })
})
