import { describe, it, expect } from 'vitest'
import { qualiFlowOutcome } from '../quali-flow-outcome'

describe('qualiFlowOutcome', () => {
  it('gegner -> haftpflicht, weiter, nicht disqualifiziert', () => {
    expect(qualiFlowOutcome('gegner', null)).toEqual({
      abrechnungsweg: 'haftpflicht',
      ergebnis: 'weiter',
      disqualifizieren: false,
      reparaturwunsch: null,
    })
  })

  it('eigenverantwortung + eigene Versicherung -> kasko, weiter, Direct-Reparatur (Aaron 08.07.)', () => {
    expect(qualiFlowOutcome('eigenverantwortung', true)).toEqual({
      abrechnungsweg: 'kasko',
      ergebnis: 'weiter',
      disqualifizieren: false,
      reparaturwunsch: 'reparatur',
    })
  })

  it('eigenverantwortung ohne Versicherung -> selbstzahler, weiter, reparaturwunsch armiert', () => {
    expect(qualiFlowOutcome('eigenverantwortung', false)).toEqual({
      abrechnungsweg: 'selbstzahler',
      ergebnis: 'weiter',
      disqualifizieren: false,
      reparaturwunsch: 'reparatur',
    })
  })

  it('eigenverantwortung ohne Versicherungsantwort (null) -> altes Abbruch-Verhalten', () => {
    const o = qualiFlowOutcome('eigenverantwortung', null)
    expect(o.abrechnungsweg).toBeNull()
    expect(o.ergebnis).toBe('abbruch')
    expect(o.disqualifizieren).toBe(true)
    expect(o.reparaturwunsch).toBeNull()
  })

  it('unklar -> kein Weg, weiter_mit_flag, nicht disqualifiziert', () => {
    expect(qualiFlowOutcome('unklar', null)).toEqual({
      abrechnungsweg: null,
      ergebnis: 'weiter_mit_flag',
      disqualifizieren: false,
      reparaturwunsch: null,
    })
  })

  it('null/leer schuldfrage -> weiter_mit_flag', () => {
    expect(qualiFlowOutcome(null, null).ergebnis).toBe('weiter_mit_flag')
  })
})
