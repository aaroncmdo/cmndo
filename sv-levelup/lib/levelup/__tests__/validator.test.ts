import { describe, expect, it } from 'vitest'
import { pruefeBefunde } from '../validator'
import { ampelFuer, befund, nichtErhoben, type Befund } from '../modul-vertrag'

const JETZT = '2026-08-18T20:00:00.000Z'

function roh(over: Partial<Befund> = {}): Befund {
  return {
    schluessel: 'https', label: 'HTTPS', wert: true, punkte: 2, maximum: 2,
    ampel: 'gruen', quelle: 'https://x.de', erhoben: JETZT, ...over,
  }
}

describe('ampelFuer', () => {
  // GESAMTSPEC §6: unter 40 % rot, 40-70 % gelb, ueber 70 % gruen
  it('setzt die Schwellen der Spec', () => {
    expect(ampelFuer(0, 10)).toBe('rot')
    expect(ampelFuer(3, 10)).toBe('rot')
    expect(ampelFuer(4, 10)).toBe('gelb')
    expect(ampelFuer(7, 10)).toBe('gelb')
    expect(ampelFuer(8, 10)).toBe('gruen')
    expect(ampelFuer(10, 10)).toBe('gruen')
  })

  it('behandelt ein Maximum von 0 als gruen, statt durch null zu teilen', () => {
    expect(ampelFuer(0, 0)).toBe('gruen')
  })
})

describe('pruefeBefunde', () => {
  it('laesst einen vollstaendigen Befund durch', () => {
    const r = pruefeBefunde([roh()])
    expect(r.gueltig).toHaveLength(1)
    expect(r.fehlstellen).toHaveLength(0)
  })

  // R-A: ohne Quelle ist eine Zahl eine Behauptung
  it('verwirft einen Befund ohne quelle und macht eine Fehlstelle daraus', () => {
    const r = pruefeBefunde([roh({ quelle: '' })])
    expect(r.gueltig).toHaveLength(0)
    expect(r.fehlstellen[0]).toMatchObject({ schluessel: 'https' })
    expect(r.fehlstellen[0].grund).toContain('Quelle')
  })

  it('verwirft einen Befund ohne erhoben', () => {
    const r = pruefeBefunde([roh({ erhoben: '' })])
    expect(r.gueltig).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('Zeitpunkt')
  })

  it('verwirft einen unbrauchbaren Zeitstempel', () => {
    const r = pruefeBefunde([roh({ erhoben: 'gestern' })])
    expect(r.gueltig).toHaveLength(0)
  })

  // R-B: wert null ohne Begruendung ist eine Luecke, die als Messung aussieht
  it('verwirft wert=null ohne grund', () => {
    const r = pruefeBefunde([roh({ wert: null, punkte: 0 })])
    expect(r.gueltig).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('grund')
  })

  it('laesst wert=null MIT grund durch', () => {
    const r = pruefeBefunde([nichtErhoben('lade', 'Ladezeit', 4, 'Seite antwortete nicht', 'https://x.de', JETZT)])
    expect(r.gueltig).toHaveLength(1)
    expect(r.gueltig[0].wert).toBeNull()
  })

  /**
   * Der Fall, den Welle 3 ausdruecklich als Fehler benennt: „wert:0 mit status
   * 'nicht_erhebbar' ist ein Fehler, kein gueltiger Zustand." Uebersetzt auf
   * unsere Form: ein Befund, der ein `grund` traegt, aber trotzdem einen Wert
   * behauptet, ist widerspruechlich.
   */
  it('verwirft einen Befund, der zugleich einen Wert und einen Nicht-Erhoben-Grund traegt', () => {
    const r = pruefeBefunde([roh({ wert: 0, grund: 'konnte nicht gemessen werden' })])
    expect(r.gueltig).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('widersprüchlich')
  })

  it('verwirft Punkte ueber dem Maximum', () => {
    const r = pruefeBefunde([roh({ punkte: 5, maximum: 2 })])
    expect(r.gueltig).toHaveLength(0)
  })

  it('verwirft negative Punkte', () => {
    const r = pruefeBefunde([roh({ punkte: -1 })])
    expect(r.gueltig).toHaveLength(0)
  })

  it('trennt gueltige von ungueltigen, statt alles zu verwerfen', () => {
    const r = pruefeBefunde([roh(), roh({ schluessel: 'kaputt', quelle: '' }), roh({ schluessel: 'ok2' })])
    expect(r.gueltig.map((b) => b.schluessel)).toEqual(['https', 'ok2'])
    expect(r.fehlstellen).toHaveLength(1)
  })

  it('summiert nur die gueltigen Punkte', () => {
    const r = pruefeBefunde([
      befund('a', 'A', true, 3, 4, 'q', JETZT),
      roh({ schluessel: 'b', punkte: 9, maximum: 2 }),   // ungueltig
    ])
    expect(r.istPunkte).toBe(3)
    expect(r.maxPunkte).toBe(4)
  })
})
