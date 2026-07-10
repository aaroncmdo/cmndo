import { describe, it, expect } from 'vitest'
import { isUstTripleConsistent, findUstInconsistencies, idsOhneMatch, istTestPartner } from './money-integrity-checks'

describe('isUstTripleConsistent', () => {
  it('true bei brutto = netto + ust', () => {
    expect(isUstTripleConsistent(100, 19, 119)).toBe(true)
  })
  it('true bei Kleinunternehmer (ust=0, brutto=netto)', () => {
    expect(isUstTripleConsistent(100, 0, 100)).toBe(true)
  })
  it('true trotz Float-Rundung (35 + 6.65 = 41.65)', () => {
    expect(isUstTripleConsistent(35, 6.65, 41.65)).toBe(true)
  })
  it('false bei brutto ungleich netto + ust', () => {
    expect(isUstTripleConsistent(100, 19, 120)).toBe(false)
  })
  it('false bei 1-Cent-Abweichung', () => {
    expect(isUstTripleConsistent(100, 19, 119.01)).toBe(false)
  })
  it('true (uebersprungen) bei null-Werten', () => {
    expect(isUstTripleConsistent(null, 19, 119)).toBe(true)
    expect(isUstTripleConsistent(100, null, 119)).toBe(true)
    expect(isUstTripleConsistent(100, 19, null)).toBe(true)
  })
  it('coerct numerische Strings (Postgres numeric kann als String kommen)', () => {
    expect(isUstTripleConsistent('100', '19', '119')).toBe(true)
    expect(isUstTripleConsistent('100', '19', '120')).toBe(false)
  })
})

describe('findUstInconsistencies', () => {
  const cols = { netto: 'n', ust: 'u', brutto: 'b' } as const
  it('gibt nur inkonsistente Zeilen zurueck', () => {
    const rows = [
      { id: 'a', n: 100, u: 19, b: 119 },
      { id: 'b', n: 100, u: 19, b: 120 },
      { id: 'c', n: 50, u: 9.5, b: 59.5 },
      { id: 'd', n: 50, u: 9.5, b: 60 },
    ]
    expect(findUstInconsistencies(rows, cols).map((r) => r.id)).toEqual(['b', 'd'])
  })
  it('leer bei allen-konsistent', () => {
    expect(findUstInconsistencies([{ id: 'a', n: 1, u: 0, b: 1 }], cols)).toEqual([])
  })
})

describe('idsOhneMatch', () => {
  it('gibt ids ohne Match in der Vorhanden-Menge zurueck', () => {
    expect(idsOhneMatch(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })
  it('leer wenn alle gematcht', () => {
    expect(idsOhneMatch(['a', 'b'], ['a', 'b', 'x'])).toEqual([])
  })
  it('alle wenn Vorhanden-Menge leer', () => {
    expect(idsOhneMatch(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('istTestPartner', () => {
  it('true bei smoke/test/demo im Namen', () => {
    expect(istTestPartner('SMOKE Werkstatt (Test)', 'werkstatt-smoke@claimondo.de')).toBe(true)
    expect(istTestPartner('Demo GmbH', null)).toBe(true)
  })
  it('true bei test/smoke in der Email', () => {
    expect(istTestPartner('Autohaus X', 'x-test@y.de')).toBe(true)
  })
  it('false bei echtem Partner', () => {
    expect(istTestPartner('Autohaus Mueller', 'info@mueller.de')).toBe(false)
    expect(istTestPartner(null, null)).toBe(false)
  })
  it('false bei "Contest" (Word-Boundary — kein Substring-False-Positive)', () => {
    expect(istTestPartner('Contest Autohaus', 'info@contest.de')).toBe(false)
  })
})
