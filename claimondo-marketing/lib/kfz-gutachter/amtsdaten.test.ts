import { describe, expect, it } from 'vitest'
import { getAmtsdaten, pkwJeTausendEinwohner } from './amtsdaten'
import { STAEDTE } from './staedte'

describe('getAmtsdaten', () => {
  it('kennt JEDE Stadt — sonst faellt die Sektion still aus', () => {
    // Die Datei wird von scripts/generate-stadt-amtsdaten.mjs erzeugt, nicht
    // gepflegt. Wer Staedte hinzufuegt und das Skript vergisst, bekommt fuer
    // die neuen keine Sektion — und merkt es nicht, weil die Seite normal
    // aussieht, nur einen Block aermer.
    const ohne = STAEDTE.filter((s) => !getAmtsdaten(s.slug)).map((s) => s.slug)
    expect(ohne).toEqual([])
  })

  it('liefert plausible Groessenordnungen, keine Platzhalter', () => {
    const koeln = getAmtsdaten('koeln')!
    expect(koeln.ags).toBe('05315000') // identisch mit dem Unfallatlas-Schluessel
    expect(koeln.kfz.pkw).toBeGreaterThan(400_000)
    expect(koeln.kfz.pkwGewerblich).toBeLessThan(koeln.kfz.pkw)
  })

  it('traegt zu jeder Zahl eine Quelle und einen Stand', () => {
    // Ohne beides duerfte die Zahl nicht auf die Seite: eine Angabe ueber einen
    // realen Ort ohne nennbare Herkunft ist genau das, was der Quellenzwang
    // beim generierten Inhalt verhindern soll.
    for (const slug of ['huerth', 'berlin', 'bocholt']) {
      const a = getAmtsdaten(slug)!
      expect(a.quelle).toMatch(/^https?:\/\/.*kba\.de/)
      expect(a.stand).toMatch(/KBA/)
    }
  })

  it('gibt null fuer Unbekanntes zurueck, statt zu raten', () => {
    expect(getAmtsdaten('gibt-es-nicht')).toBeNull()
  })
})

describe('pkwJeTausendEinwohner', () => {
  it('rechnet mit der gepflegten Tsd.-Schreibweise', () => {
    expect(pkwJeTausendEinwohner(36_636, '62 Tsd.')).toBe(591)
  })

  it('rechnet mit der Mio.-Schreibweise', () => {
    // ⚠ Die Falle: "1,1 Mio." als Zahl gelesen ergibt 1,1 — ohne
    // Mio-Erkennung kaeme eine absurde Kennzahl heraus.
    expect(pkwJeTausendEinwohner(501_926, '1,1 Mio.')).toBe(456)
  })

  it('liefert null statt einer erfundenen Kennzahl', () => {
    for (const roh of ['', 'unbekannt', '0']) {
      expect(pkwJeTausendEinwohner(1000, roh)).toBeNull()
    }
  })

  it('rechnet fuer JEDE Stadt einen plausiblen Wert aus', () => {
    // Deutschlandweit liegt die Motorisierung grob bei 250-900 Pkw je 1.000
    // Einwohner. Alles ausserhalb waere ein Parsing- oder Zuordnungsfehler —
    // und stuende dann auf einer oeffentlichen Seite.
    const ausreisser: string[] = []
    for (const s of STAEDTE) {
      const a = getAmtsdaten(s.slug)
      if (!a) continue
      const q = pkwJeTausendEinwohner(a.kfz.pkw, s.bevoelkerung)
      if (q === null || q < 250 || q > 1300) ausreisser.push(`${s.slug}=${q}`)
    }
    expect(ausreisser).toEqual([])
  })
})
