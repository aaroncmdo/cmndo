import { describe, it, expect } from 'vitest'
import {
  computeNutzungsausfall,
  altersRueckstufung,
  findeKlasse,
  NA_KLASSEN,
  LANGE_DAUER_TAGE,
} from './nutzungsausfall'

describe('NA_KLASSEN (Datenbasis)', () => {
  it('hat 11 Klassen A-L ohne "I"', () => {
    expect(NA_KLASSEN).toHaveLength(11)
    const buchstaben = NA_KLASSEN.map((k) => k.klasse)
    expect(buchstaben).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L'])
    expect(buchstaben).not.toContain('I')
  })

  it('spiegelt die autounfall-io-Spannen (Stichproben)', () => {
    expect(findeKlasse('A')?.satz).toEqual([23, 27])
    expect(findeKlasse('E')?.satz).toEqual([59, 65])
    expect(findeKlasse('L')?.satz).toEqual([175, 219])
  })

  it('ist monoton steigend und hat min <= max je Klasse', () => {
    let vorherMin = 0
    for (const k of NA_KLASSEN) {
      expect(k.satz[0]).toBeLessThanOrEqual(k.satz[1])
      expect(k.satz[0]).toBeGreaterThan(vorherMin)
      vorherMin = k.satz[0]
    }
  })

  it('hat für jede Klasse Bezeichnung + Beispielfahrzeuge', () => {
    for (const k of NA_KLASSEN) {
      expect(k.bezeichnung.length).toBeGreaterThan(3)
      expect(k.beispiele.length).toBeGreaterThan(3)
    }
  })
})

describe('altersRueckstufung', () => {
  it('stuft nach den App-Grenzen zurück', () => {
    expect(altersRueckstufung(0)).toBe(0)
    expect(altersRueckstufung(5)).toBe(0)
    expect(altersRueckstufung(6)).toBe(1)
    expect(altersRueckstufung(10)).toBe(1)
    expect(altersRueckstufung(11)).toBe(2)
    expect(altersRueckstufung(30)).toBe(2)
  })
  it('ignoriert fehlende/ungültige Angaben', () => {
    expect(altersRueckstufung(undefined)).toBe(0)
    expect(altersRueckstufung(Number.NaN)).toBe(0)
    expect(altersRueckstufung(-3)).toBe(0)
  })
})

describe('computeNutzungsausfall', () => {
  it('rechnet Spanne × Tage (Klasse E, 14 Tage)', () => {
    const r = computeNutzungsausfall({ klasse: 'E', tage: 14 })
    expect(r.kind).toBe('schaetzung')
    if (r.kind !== 'schaetzung') return
    expect(r.min).toBe(59 * 14) // 826
    expect(r.max).toBe(65 * 14) // 910
    expect(r.klasse).toBe('E')
    expect(r.stufen).toBe(0)
    expect(r.hinweise).not.toContain('rueckstufung')
  })

  it('stuft bei altem Fahrzeug zurück (E, 12 Jahre → C)', () => {
    const r = computeNutzungsausfall({ klasse: 'E', tage: 10, alterJahre: 12 })
    expect(r.kind).toBe('schaetzung')
    if (r.kind !== 'schaetzung') return
    expect(r.basis).toBe('E')
    expect(r.klasse).toBe('C') // E -> D -> C
    expect(r.stufen).toBe(2)
    expect(r.min).toBe(38 * 10)
    expect(r.hinweise).toContain('rueckstufung')
  })

  it('stuft bei 7 Jahren um genau eine Klasse zurück', () => {
    const r = computeNutzungsausfall({ klasse: 'G', tage: 5, alterJahre: 7 })
    if (r.kind !== 'schaetzung') throw new Error('erwartet schaetzung')
    expect(r.klasse).toBe('F')
    expect(r.stufen).toBe(1)
  })

  it('clamped die Rückstufung bei Klasse A', () => {
    const r = computeNutzungsausfall({ klasse: 'A', tage: 7, alterJahre: 20 })
    if (r.kind !== 'schaetzung') throw new Error('erwartet schaetzung')
    expect(r.klasse).toBe('A')
    expect(r.stufen).toBe(0) // keine Rückstufung möglich
    expect(r.hinweise).not.toContain('rueckstufung')
  })

  it('setzt lange_dauer erst oberhalb der Schwelle', () => {
    const kurz = computeNutzungsausfall({ klasse: 'C', tage: LANGE_DAUER_TAGE })
    const lang = computeNutzungsausfall({ klasse: 'C', tage: LANGE_DAUER_TAGE + 1 })
    if (kurz.kind !== 'schaetzung' || lang.kind !== 'schaetzung') throw new Error('erwartet schaetzung')
    expect(kurz.hinweise).not.toContain('lange_dauer')
    expect(lang.hinweise).toContain('lange_dauer')
  })

  it('liefert unvollstaendig bei fehlender/ungültiger Eingabe', () => {
    expect(computeNutzungsausfall({ klasse: '', tage: 5 }).kind).toBe('unvollstaendig')
    expect(computeNutzungsausfall({ klasse: 'X', tage: 5 }).kind).toBe('unvollstaendig')
    expect(computeNutzungsausfall({ klasse: 'C', tage: 0 }).kind).toBe('unvollstaendig')
    expect(computeNutzungsausfall({ klasse: 'C', tage: -2 }).kind).toBe('unvollstaendig')
    expect(computeNutzungsausfall({ klasse: 'C', tage: Number.NaN }).kind).toBe('unvollstaendig')
  })
})
