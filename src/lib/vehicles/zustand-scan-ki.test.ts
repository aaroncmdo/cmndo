import { describe, it, expect } from 'vitest'
import { parseFunde } from './zustand-scan-ki'

describe('parseFunde', () => {
  it('parst valides JSON-Array in Funde', () => {
    const t =
      'Text davor {"funde":[{"perspektive":"seite_links","bereich":"Tür","art":"Kratzer","schwere":"leicht","confidence":80,"beschreibung":"langer Kratzer"}]}'
    expect(parseFunde(t)).toEqual([
      { perspektive: 'seite_links', bereich: 'Tür', art: 'Kratzer', schwere: 'leicht', confidence: 80, beschreibung: 'langer Kratzer' },
    ])
  })
  it('leeres/kaputtes JSON -> []', () => {
    expect(parseFunde('kein json')).toEqual([])
    expect(parseFunde('{"funde": nope}')).toEqual([])
  })
  it('unbekannte schwere -> Fund verworfen', () => {
    expect(
      parseFunde('{"funde":[{"perspektive":"front","bereich":"x","art":"y","schwere":"kaputt","confidence":50,"beschreibung":"z"}]}'),
    ).toEqual([])
  })
  it('confidence wird auf 0-100 geclampt', () => {
    expect(
      parseFunde('{"funde":[{"perspektive":"front","bereich":"x","art":"y","schwere":"mittel","confidence":250,"beschreibung":"z"}]}')[0]
        .confidence,
    ).toBe(100)
  })
})
