import { describe, it, expect } from 'vitest'
import { qualifiziereWerkstaetten } from '../qualifiziere'
import type { Reparaturbedarf } from '../types'

const W = (id: string, faehigkeiten: string[] | null) => ({ id, faehigkeiten })
const bedarf = (kategorien: string[], confidence: number): Reparaturbedarf =>
  ({ kategorien: kategorien as never, quelle: 'gutachten', confidence })

describe('qualifiziereWerkstaetten', () => {
  it('hohe Confidence: passt+unbekannt sichtbar (passt zuerst), passt_nicht raus', () => {
    const rows = [W('a', ['lackierung']), W('b', ['karosserie']), W('c', null)]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    expect(r.hartGefiltert).toBe(true)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'c']) // b (passt_nicht) raus; a (passt) vor c (unbekannt)
    expect(r.keineSpezialisierte).toBe(false)
  })
  it('hohe Confidence, 0 Treffer -> Fallback: alle zeigen + Flag', () => {
    const rows = [W('a', ['karosserie']), W('b', ['mechanik'])]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    expect(r.keineSpezialisierte).toBe(true)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.hartGefiltert).toBe(false)
  })
  it('niedrige Confidence -> weich: alle zeigen, kein Filter', () => {
    const rows = [W('a', ['lackierung']), W('b', ['karosserie'])]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 40))
    expect(r.hartGefiltert).toBe(false)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('unbekannter Bedarf -> weich, alle unbekannt', () => {
    const rows = [W('a', ['lackierung'])]
    const r = qualifiziereWerkstaetten(rows, bedarf([], 0))
    expect(r.werkstaetten[0].fit).toBe('unbekannt')
    expect(r.hartGefiltert).toBe(false)
  })
})
