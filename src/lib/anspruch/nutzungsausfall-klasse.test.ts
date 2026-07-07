import { describe, it, expect } from 'vitest'
import {
  bestimmeNutzungsausfallKlasse, altersRueckstufung,
  SEGMENT_ZU_KLASSE, STANDARD_KLASSE_SAETZE, KLASSEN_REIHE,
} from './nutzungsausfall-klasse'

describe('altersRueckstufung', () => {
  it('null Alter -> 0', () => expect(altersRueckstufung(null)).toBe(0))
  it('<=5 Jahre -> 0', () => { expect(altersRueckstufung(0)).toBe(0); expect(altersRueckstufung(5)).toBe(0) })
  it('>5 und <=10 Jahre -> 1', () => { expect(altersRueckstufung(6)).toBe(1); expect(altersRueckstufung(10)).toBe(1) })
  it('>10 Jahre -> 2', () => { expect(altersRueckstufung(11)).toBe(2); expect(altersRueckstufung(25)).toBe(2) })
})

describe('bestimmeNutzungsausfallKlasse', () => {
  it('mittelklasse jung (3J) -> E (43), keine Ruckstufung', () => {
    const r = bestimmeNutzungsausfallKlasse('mittelklasse', 3)
    expect(r.basis).toBe('E'); expect(r.klasse).toBe('E'); expect(r.satzEur).toBe(43); expect(r.stufen).toBe(0)
  })
  it('mittelklasse >5J -> D (38), 1 Stufe', () => {
    const r = bestimmeNutzungsausfallKlasse('mittelklasse', 6)
    expect(r.basis).toBe('E'); expect(r.klasse).toBe('D'); expect(r.satzEur).toBe(38); expect(r.stufen).toBe(1)
  })
  it('mittelklasse >10J -> C (35), 2 Stufen', () => {
    const r = bestimmeNutzungsausfallKlasse('mittelklasse', 12)
    expect(r.klasse).toBe('C'); expect(r.satzEur).toBe(35); expect(r.stufen).toBe(2)
  })
  it('kleinwagen (B) >10J: clamped auf A (23), real nur 1 Stufe', () => {
    const r = bestimmeNutzungsausfallKlasse('kleinwagen', 15)
    expect(r.basis).toBe('B'); expect(r.klasse).toBe('A'); expect(r.satzEur).toBe(23); expect(r.stufen).toBe(1)
  })
  it('null Alter -> Basisklasse ohne Abschlag', () => {
    const r = bestimmeNutzungsausfallKlasse('oberklasse', null)
    expect(r.klasse).toBe('G'); expect(r.satzEur).toBe(59); expect(r.stufen).toBe(0)
  })
  it('suv -> J (79), transporter -> G (59)', () => {
    expect(bestimmeNutzungsausfallKlasse('suv', 2).klasse).toBe('J')
    expect(bestimmeNutzungsausfallKlasse('suv', 2).satzEur).toBe(79)
    expect(bestimmeNutzungsausfallKlasse('transporter', 2).klasse).toBe('G')
    expect(bestimmeNutzungsausfallKlasse('transporter', 2).satzEur).toBe(59)
  })
  it('"I" ist ausgelassen: J folgt direkt auf H (ein Schritt, keine Luecke)', () => {
    expect(KLASSEN_REIHE.indexOf('J') - KLASSEN_REIHE.indexOf('H')).toBe(1)
    // oberklasse (G) >5J -> ein Schritt runter = F (nicht "H"/aufwaerts)
    expect(bestimmeNutzungsausfallKlasse('oberklasse', 7).klasse).toBe('F')
  })
  it('DB-Saetze uebersteuern die Standard-Saetze', () => {
    const custom = { ...STANDARD_KLASSE_SAETZE, E: 99 }
    expect(bestimmeNutzungsausfallKlasse('mittelklasse', 2, custom).satzEur).toBe(99)
  })
})

describe('Vollstaendigkeit', () => {
  it('jedes Segment mappt auf eine gueltige Klasse', () => {
    for (const seg of Object.keys(SEGMENT_ZU_KLASSE) as (keyof typeof SEGMENT_ZU_KLASSE)[]) {
      expect(KLASSEN_REIHE).toContain(SEGMENT_ZU_KLASSE[seg])
    }
  })
  it('jede Klasse hat einen Standard-Satz', () => {
    for (const k of KLASSEN_REIHE) expect(typeof STANDARD_KLASSE_SAETZE[k]).toBe('number')
  })
})
