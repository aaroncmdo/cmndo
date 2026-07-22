import { describe, it, expect } from 'vitest'
import { ampelAusProzent, parseQualitaet } from './zustand-foto-qualitaet'

describe('ampelAusProzent', () => {
  it('gruen ab 75', () => {
    expect(ampelAusProzent(100)).toBe('gruen')
    expect(ampelAusProzent(75)).toBe('gruen')
  })
  it('amber 50-74', () => {
    expect(ampelAusProzent(74)).toBe('amber')
    expect(ampelAusProzent(50)).toBe('amber')
  })
  it('rot unter 50', () => {
    expect(ampelAusProzent(49)).toBe('rot')
    expect(ampelAusProzent(0)).toBe('rot')
  })
})

describe('parseQualitaet', () => {
  it('parst prozent + hinweis', () => {
    expect(parseQualitaet('{"prozent": 82, "hinweis": "leicht unscharf"}')).toEqual({
      prozent: 82,
      hinweis: 'leicht unscharf',
    })
  })
  it('leerer Hinweis -> null', () => {
    expect(parseQualitaet('Text {"prozent": 95, "hinweis": ""} Ende')).toEqual({ prozent: 95, hinweis: null })
  })
  it('klemmt + rundet prozent auf 0-100', () => {
    expect(parseQualitaet('{"prozent": 140}')).toEqual({ prozent: 100, hinweis: null })
    expect(parseQualitaet('{"prozent": 63.7}')).toEqual({ prozent: 64, hinweis: null })
    expect(parseQualitaet('{"prozent": "88"}')).toEqual({ prozent: 88, hinweis: null })
  })
  it('kein JSON / kein prozent / malformed -> null', () => {
    expect(parseQualitaet('keine Zahl')).toBeNull()
    expect(parseQualitaet('{"hinweis": "ok"}')).toBeNull()
    expect(parseQualitaet('{prozent: 80')).toBeNull()
  })
})
