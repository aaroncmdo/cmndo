import { describe, it, expect } from 'vitest'
import { SCHADENTYP_OPTIONS, SCHADENTYP_VALUES, schadentypLabel } from '../schadentyp-options'

describe('schadentyp-options', () => {
  it('deckt exakt die 5 leads_schadentyp_check-Werte ab', () => {
    // DB-CHECK leads_schadentyp_check erlaubt genau diese 5 (+ NULL). Guard gegen Drift:
    // weicht die Konstante ab, wuerde der Select ungueltige Werte anbieten -> Constraint-Fehler.
    expect([...SCHADENTYP_VALUES].sort()).toEqual(
      ['auffahrunfall', 'parkplatz', 'sonstiges', 'spurwechsel', 'vorfahrtsverletzung'].sort(),
    )
  })

  it('schadentypLabel: null -> Strich, bekannt -> Label, unbekannt -> roher Wert', () => {
    expect(schadentypLabel(null)).toBe('–')
    expect(schadentypLabel('auffahrunfall')).toBe('Auffahrunfall')
    expect(schadentypLabel('xyz')).toBe('xyz')
  })

  it('jede Option hat value + label', () => {
    for (const o of SCHADENTYP_OPTIONS) {
      expect(o.value).toBeTruthy()
      expect(o.label).toBeTruthy()
    }
  })
})
