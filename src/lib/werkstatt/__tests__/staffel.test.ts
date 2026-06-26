import { describe, it, expect } from 'vitest'
import { berechneStaffelFortschritt } from '../staffel'

const stufen = [
  { schwelle: 10, bonus_betrag_netto: 500 },
  { schwelle: 25, bonus_betrag_netto: 1500 },
]

describe('berechneStaffelFortschritt', () => {
  it('waehlt die naechste nicht erreichte Stufe + Prozent (von 0)', () => {
    const r = berechneStaffelFortschritt(4, stufen)
    expect(r.naechste?.schwelle).toBe(10)
    expect(r.prozent).toBe(40)
    expect(r.alleErreicht).toBe(false)
    expect(r.erreichteSchwellen).toEqual([])
  })

  it('springt zur naechsten Stufe wenn die erste erreicht ist (Basis = erreichte Schwelle)', () => {
    const r = berechneStaffelFortschritt(12, stufen)
    expect(r.naechste?.schwelle).toBe(25)
    // (12-10)/(25-10) = 13.33%
    expect(Math.round(r.prozent)).toBe(13)
    expect(r.erreichteSchwellen).toContain(10)
  })

  it('alleErreicht wenn ueber der hoechsten Schwelle', () => {
    const r = berechneStaffelFortschritt(30, stufen)
    expect(r.naechste).toBeNull()
    expect(r.alleErreicht).toBe(true)
    expect(r.prozent).toBe(100)
    expect(r.erreichteSchwellen).toEqual([10, 25])
  })

  it('leere Stufen -> kein Fortschritt, nicht alleErreicht', () => {
    const r = berechneStaffelFortschritt(5, [])
    expect(r.naechste).toBeNull()
    expect(r.alleErreicht).toBe(false)
    expect(r.prozent).toBe(0)
  })
})
