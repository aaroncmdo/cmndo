import { describe, it, expect } from 'vitest'
import { qualifiziereWerkstaetten } from '../qualifiziere'
import type { Reparaturbedarf } from '../types'

const W = (id: string, faehigkeiten: string[] | null) => ({ id, faehigkeiten })
const WV = (id: string, faehigkeiten: string[] | null, verifiziert?: boolean) => ({ id, faehigkeiten, verifiziert })
const bedarf = (kategorien: string[], confidence: number): Reparaturbedarf =>
  ({ kategorien: kategorien as never, quelle: 'gutachten', confidence })

describe('qualifiziereWerkstaetten — Inc-1 Bestands-Tests', () => {
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

describe('qualifiziereWerkstaetten — Inc-3 verifiziert-Vorreihung', () => {
  it('hart-Modus: verifiziert+passt vor unverifiziert+passt vor unbekannt', () => {
    // A passt, unverifiziert; B passt, verifiziert; C unbekannt, verifiziert
    const rows = [
      WV('A', ['lackierung'], false),
      WV('B', ['lackierung'], true),
      WV('C', null, true),
    ]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    expect(r.hartGefiltert).toBe(true)
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['B', 'A', 'C'])
  })

  it('hart-Modus: Distanz-Reihenfolge innerhalb gleicher (fit,verifiziert)-Gruppe erhalten', () => {
    // Beide passt+verifiziert; Eingabe-Reihenfolge (D1=naeher, D2=weiter) muss stabil bleiben
    const rows = [
      WV('D1', ['karosserie'], true), // passt, verifiziert, naeher
      WV('D2', ['karosserie'], true), // passt, verifiziert, weiter
    ]
    const r = qualifiziereWerkstaetten(rows, bedarf(['karosserie'], 100))
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['D1', 'D2'])
  })

  it('hart-Modus: ohne verifiziert-Feld (undefined) = keine Aenderung zur Inc-1-Reihenfolge', () => {
    // Inc-1-Rows ohne verifiziert-Feld — verifiziert undefined behandelt wie false
    const rows = [W('a', ['lackierung']), W('b', ['karosserie']), W('c', null)]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 100))
    // 'a'=passt, 'c'=unbekannt — kein verifiziert => keine Reorder gegenueber Inc-1
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('weich-Modus: verifiziert hat keinen Einfluss auf Reihenfolge', () => {
    const rows = [
      WV('X', ['lackierung'], false),
      WV('Y', ['lackierung'], true),
    ]
    const r = qualifiziereWerkstaetten(rows, bedarf(['lackierung'], 40))
    expect(r.hartGefiltert).toBe(false)
    // Weich-Pfad: Eingabe-Reihenfolge unveraendert
    expect(r.werkstaetten.map((x) => x.id)).toEqual(['X', 'Y'])
  })
})
