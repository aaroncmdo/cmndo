import { describe, it, expect } from 'vitest'
import {
  resolveAbrechnungsweg,
  routeForAbrechnungsweg,
  istReparaturOnly,
} from '../abrechnungsweg'

describe('resolveAbrechnungsweg', () => {
  it('gegner -> haftpflicht (unabhaengig von der Versicherungsangabe)', () => {
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: null })).toBe('haftpflicht')
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: true })).toBe('haftpflicht')
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: false })).toBe('haftpflicht')
  })

  it('eigenverantwortung + eigene Versicherung -> kasko', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: true }),
    ).toBe('kasko')
  })

  it('eigenverantwortung ohne eigene Versicherung -> selbstzahler', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: false }),
    ).toBe('selbstzahler')
  })

  it('eigenverantwortung + Versicherungsfrage offen (null) -> null (Flow fragt nach)', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: null }),
    ).toBeNull()
  })

  it('schuldfrage null oder unbekannt -> null', () => {
    expect(resolveAbrechnungsweg({ schuldfrage: null, ueberEigeneVersicherung: true })).toBeNull()
    expect(resolveAbrechnungsweg({ schuldfrage: 'unklar', ueberEigeneVersicherung: false })).toBeNull()
  })
})

describe('routeForAbrechnungsweg', () => {
  it('mappt jeden Weg auf seine Route', () => {
    expect(routeForAbrechnungsweg('haftpflicht')).toBe('kanonisch')
    expect(routeForAbrechnungsweg('kasko')).toBe('kasko_hinweis')
    expect(routeForAbrechnungsweg('selbstzahler')).toBe('selbstzahler_reparatur')
  })
})

describe('istReparaturOnly', () => {
  it('nur selbstzahler ist reparatur-only', () => {
    expect(istReparaturOnly('selbstzahler')).toBe(true)
  })

  it('haftpflicht / kasko / null / unbekannt sind es nicht', () => {
    expect(istReparaturOnly('haftpflicht')).toBe(false)
    expect(istReparaturOnly('kasko')).toBe(false)
    expect(istReparaturOnly(null)).toBe(false)
    expect(istReparaturOnly('irgendwas')).toBe(false)
  })
})
