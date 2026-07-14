import { describe, it, expect } from 'vitest'
import { buildKennzeichen, buildKennzeichenFields, parseKennzeichen, clampKennzeichenForDb } from './kennzeichen'

describe('buildKennzeichen', () => {
  it('baut die kombinierte Form mit Suffix', () => {
    expect(buildKennzeichen('K', 'AS', '1234', 'E')).toBe('K-AS 1234E')
  })
  it('ohne Buchstaben fällt der Bindestrich weg', () => {
    expect(buildKennzeichen('K', '', '1234', null)).toBe('K 1234')
  })
  it('leere Teile -> leerer String', () => {
    expect(buildKennzeichen('', '', '', null)).toBe('')
  })
})

describe('buildKennzeichenFields (P2d-2b)', () => {
  it('mappt alle 5 Spalten + uppercase Stadt/Kennung', () => {
    expect(buildKennzeichenFields('k', 'as', '1234', 'E')).toEqual({
      kennzeichen: 'K-AS 1234E',
      kennzeichen_kreis: 'K',
      kennzeichen_buchstaben: 'AS',
      kennzeichen_zahl: '1234',
      kennzeichen_suffix: 'E',
    })
  })

  it('leeres Suffix -> kennzeichen_suffix null, kein Suffix im kombinierten String', () => {
    expect(buildKennzeichenFields('K', 'AS', '1234', '')).toEqual({
      kennzeichen: 'K-AS 1234',
      kennzeichen_kreis: 'K',
      kennzeichen_buchstaben: 'AS',
      kennzeichen_zahl: '1234',
      kennzeichen_suffix: null,
    })
  })

  it('alle Teile leer -> alle Spalten null', () => {
    expect(buildKennzeichenFields('', '', '', '')).toEqual({
      kennzeichen: null,
      kennzeichen_kreis: null,
      kennzeichen_buchstaben: null,
      kennzeichen_zahl: null,
      kennzeichen_suffix: null,
    })
  })

  it('nur Stadt + Zahl (ohne Kennung) ist gültig', () => {
    expect(buildKennzeichenFields('K', '', '1234', '')).toEqual({
      kennzeichen: 'K 1234',
      kennzeichen_kreis: 'K',
      kennzeichen_buchstaben: null,
      kennzeichen_zahl: '1234',
      kennzeichen_suffix: null,
    })
  })

  it('H-Suffix (Oldtimer) wird übernommen', () => {
    expect(buildKennzeichenFields('M', 'A', '99', 'H').kennzeichen_suffix).toBe('H')
    expect(buildKennzeichenFields('M', 'A', '99', 'H').kennzeichen).toBe('M-A 99H')
  })

  it('ungültiges Suffix wird ignoriert (nur E/H erlaubt)', () => {
    const r = buildKennzeichenFields('K', 'AS', '1234', 'X')
    expect(r.kennzeichen_suffix).toBeNull()
    expect(r.kennzeichen).toBe('K-AS 1234')
  })
})

describe('parseKennzeichen (round-trip-Sanity)', () => {
  it('parst die kombinierte Form zurück in Teile', () => {
    expect(parseKennzeichen('K-AS 1234E')).toEqual({
      kreis: 'K',
      buchstaben: 'AS',
      zahl: '1234',
      suffix: 'E',
    })
  })
})

describe('clampKennzeichenForDb (F5 - varchar(20)-Overflow-Schutz)', () => {
  it('null/undefined/leer/whitespace -> null', () => {
    expect(clampKennzeichenForDb(null)).toBeNull()
    expect(clampKennzeichenForDb(undefined)).toBeNull()
    expect(clampKennzeichenForDb('')).toBeNull()
    expect(clampKennzeichenForDb('   ')).toBeNull()
  })
  it('valides Kennzeichen bleibt unveraendert (<= 20)', () => {
    expect(clampKennzeichenForDb('B-TE 9999')).toBe('B-TE 9999')
    expect(clampKennzeichenForDb('  M-XY 1234  ')).toBe('M-XY 1234')
  })
  it('ueberlanger Freitext wird auf 20 Zeichen gekuerzt (B1-Repro, kein Crash)', () => {
    const clamped = clampKennzeichenForDb('Berlin Teststrasse 1 - Auffahrunfall Test')
    expect(clamped).toHaveLength(20)
    expect(clamped).toBe('Berlin Teststrasse 1')
  })
  it('genau 20 Zeichen bleibt 20', () => {
    expect(clampKennzeichenForDb('12345678901234567890')).toBe('12345678901234567890')
  })
})
