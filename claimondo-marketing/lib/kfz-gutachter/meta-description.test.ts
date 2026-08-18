import { describe, expect, it } from 'vitest'
import { stadtMetaDescription, MAX_META_LAENGE } from './meta-description'
import { STAEDTE, getStadtBySlug } from './staedte'

const koeln = getStadtBySlug('koeln')!
const bocholt = getStadtBySlug('bocholt')!

describe('stadtMetaDescription — ohne Ortstiefe', () => {
  it('nennt den Ort und die zustaendigen Gerichte', () => {
    // Die alte Fassung war fuer JEDE Stadt derselbe Satz mit ausgetauschtem
    // Ortsnamen. Amtsgericht und PLZ sind gepflegte, ortsspezifische Fakten —
    // sie machen die Beschreibung unterscheidbar, ohne etwas zu erfinden.
    const d = stadtMetaDescription(bocholt)
    expect(d).toContain('Bocholt')
    expect(d).toContain(bocholt.lokal.amtsgericht)
  })

  it('unterscheidet sich zwischen zwei Staedten in mehr als dem Namen', () => {
    const a = stadtMetaDescription(koeln).replace(/Köln/g, '<ORT>')
    const b = stadtMetaDescription(bocholt).replace(/Bocholt/g, '<ORT>')
    expect(a).not.toBe(b)
  })

  it('bleibt in der Laenge, die Suchmaschinen anzeigen', () => {
    for (const s of STAEDTE) {
      const d = stadtMetaDescription(s)
      expect(d.length).toBeLessThanOrEqual(MAX_META_LAENGE)
      expect(d.length).toBeGreaterThan(80)
    }
  })

  it('nennt auch bei langen Namen noch den Ortsbezug', () => {
    // Ludwigshafen am Rhein und Mülheim an der Ruhr haben lange Orts- UND
    // Gerichtsnamen. Ohne Kurzfassung fiel der Mittelteil dort ganz weg und die
    // Beschreibung schrumpfte auf ~88 Zeichen — die Seite unterschied sich dann
    // nur noch im Ortsnamen, also genau das Problem von vorher.
    for (const s of STAEDTE) {
      expect(stadtMetaDescription(s)).toContain(`Raum ${s.plzPrefix}`)
    }
  })

  it('erzeugt fuer JEDE Stadt eine eigene Beschreibung', () => {
    // Der eigentliche Vertrag. Doppelte Meta-Descriptions ueber hunderte Seiten
    // sind ein Duplicate-Content-Signal — genau das Muster, das Google als
    // "Scaled Content" abwertet.
    const alle = STAEDTE.map((s) => stadtMetaDescription(s))
    expect(new Set(alle).size).toBe(STAEDTE.length)
  })

  it('endet nicht mitten im Wort', () => {
    for (const s of STAEDTE) {
      const d = stadtMetaDescription(s)
      expect(d.endsWith('…')).toBe(false)
      expect(/[.!)]$/.test(d)).toBe(true)
    }
  })

  it('traegt auf JEDER Seite den Kostenhinweis', () => {
    // Der Schlusssatz ist das staerkste Argument im Suchergebnis. Die erste
    // Fassung war 61 Zeichen lang und fiel bei kurzen Ortsnamen aus der
    // Laengengrenze — Bocholt kam auf 100 Zeichen ganz ohne ihn. Ein Satz, der
    // nur auf der Haelfte der Seiten erscheint, ist schlechter als ein
    // kuerzerer, der ueberall passt.
    const ohne = STAEDTE.filter((s) => !stadtMetaDescription(s).includes('0 €'))
    expect(ohne.map((s) => s.slug)).toEqual([])
  })
})

describe('stadtMetaDescription — mit freigegebener Ortstiefe', () => {
  const tiefe = {
    stadtbezirke: [
      { name: 'Innenstadt', ortsteile: [] },
      { name: 'Feldmark', ortsteile: [] },
      { name: 'Biemenhorst', ortsteile: [] },
    ],
    hauptachsen: { autobahnen: ['A3'], bundesstrassen: ['B67'], knoten: [] },
    unfallHotspots: [],
    lokaleFaqs: [],
  }

  it('nutzt die Stadtbezirke, wenn es welche gibt', () => {
    const d = stadtMetaDescription(bocholt, tiefe)
    expect(d).toContain('Innenstadt')
    expect(d).toContain('Bocholt')
  })

  it('weicht auf die Hauptachsen aus, wenn keine Bezirke gepflegt sind', () => {
    const d = stadtMetaDescription(bocholt, { ...tiefe, stadtbezirke: [] })
    expect(d).toContain('A3')
  })

  it('faellt auf die Gerichts-Fassung zurueck, wenn die Tiefe leer ist', () => {
    const leer = { ...tiefe, stadtbezirke: [], hauptachsen: { autobahnen: [], bundesstrassen: [], knoten: [] } }
    expect(stadtMetaDescription(bocholt, leer)).toBe(stadtMetaDescription(bocholt))
  })

  it('haelt auch mit Ortstiefe die Laengengrenze', () => {
    const viele = {
      ...tiefe,
      stadtbezirke: Array.from({ length: 12 }, (_, i) => ({ name: `Sehr Langer Bezirksname ${i}`, ortsteile: [] })),
    }
    expect(stadtMetaDescription(bocholt, viele).length).toBeLessThanOrEqual(MAX_META_LAENGE)
  })
})
