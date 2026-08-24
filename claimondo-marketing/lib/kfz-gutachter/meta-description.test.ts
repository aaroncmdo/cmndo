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

// ---------------------------------------------------------------------------
// Amtliche Nummern-Praefixe (19.08.2026)
//
// Beim ersten scharfen Cron-Lauf kam Frankfurt so auf prod:
//   "… unabhängige Sachverständige für Ortsbezirk 1 - Innenstadt I und Umgebung."
// Amtlich korrekt (so heissen Frankfurts Bezirke), als Suchergebnis-Text aber
// schwach — niemand sucht nach "Ortsbezirk 1". Die vier anderen Staedte des
// Laufs lieferten saubere Namen (Mitte, Hamburg-Mitte, Innenstadt,
// Altstadt-Lehel); Duesseldorf mit "Stadtbezirk N" steht als naechstes an.
//
// Nur die Beschreibung kuerzt — auf der Seite bleibt der amtliche Name stehen,
// dort ist er richtig.
// ---------------------------------------------------------------------------
describe('stadtMetaDescription — amtliche Bezirks-Praefixe', () => {
  const tiefeMit = (...namen: string[]) => ({ stadtbezirke: namen.map((name) => ({ name })) })

  it('kuerzt "Ortsbezirk 1 - Innenstadt I" auf den sprechenden Teil', () => {
    const d = stadtMetaDescription(bocholt, tiefeMit('Ortsbezirk 1 - Innenstadt I'))
    expect(d).toContain('Innenstadt I')
    expect(d).not.toContain('Ortsbezirk')
  })

  it('kuerzt auch Stadtbezirk mit Gedankenstrich (Duesseldorf/Muenchen-Schreibweise)', () => {
    const d = stadtMetaDescription(bocholt, tiefeMit('Stadtbezirk 3 – Maxvorstadt'))
    expect(d).toContain('Maxvorstadt')
    expect(d).not.toContain('Stadtbezirk')
  })

  it('laesst sprechende Namen unangetastet', () => {
    for (const name of ['Mitte', 'Hamburg-Mitte', 'Altstadt-Lehel', 'Friedrichshain-Kreuzberg']) {
      expect(stadtMetaDescription(bocholt, tiefeMit(name))).toContain(name)
    }
  })

  it('faellt bei einer nackten Nummer auf den Gerichts-Anker zurueck', () => {
    // ⚠ KEHRTWENDE gegenueber dem 19.08. Dieser Test verlangte urspruenglich
    // das Gegenteil ("Bezirk 5" stehen lassen), begruendet mit "lieber schwach
    // als leer". Die Annahme war falsch: es wird nicht leer. Faellt der Bezirk
    // weg, greift der Gerichts-Anker — "im Raum 46 (Amtsgericht Bocholt)" ist
    // im Suchergebnis konkreter als "Bezirk 5", und PLZ-Raum plus Gericht
    // unterscheiden die Seiten voneinander.
    //
    // Aufgefallen ist es erst, als Duesseldorf am 20.08. real
    // "fuer Bezirk 1, Bezirk 2, Bezirk 3 und Umgebung" ausspielte. Der Fall
    // war 2026-08-19 nur gedacht, nicht gesehen.
    const d = stadtMetaDescription(bocholt, tiefeMit('Bezirk 5'))
    expect(d).not.toContain('Bezirk 5')
    expect(d).toContain(bocholt.lokal.amtsgericht)
  })

  it('nennt rein nummerierte Bezirke NICHT — die sagen im Suchergebnis nichts', () => {
    // Duesseldorf, real auf prod (20.08.): sowohl der Hub-Snapshot ("Bezirk 1"
    // … "Bezirk 10") als auch der generierte DB-Inhalt ("Stadtbezirk 1" …)
    // tragen reine Nummern. Die Beschreibung lautete damit
    //   "… unabhaengige Sachverstaendige fuer Bezirk 1, Bezirk 2, Bezirk 3 …"
    // Niemand sucht nach "Bezirk 2", und es liest sich wie ein Automat.
    // Die Achsen sind die konkretere Aussage — der Zweig existiert bereits.
    const d = stadtMetaDescription(bocholt, {
      stadtbezirke: [{ name: 'Bezirk 1' }, { name: 'Stadtbezirk 2' }, { name: 'Ortsbezirk 3' }],
      hauptachsen: { autobahnen: ['A3', 'A46'], bundesstrassen: ['B8'], knoten: [] },
    })
    expect(d).not.toMatch(/Bezirk \d/)
    expect(d).toContain('A3')
  })

  it('nimmt die sprechenden Bezirke, wenn nur EINZELNE nur Nummern sind', () => {
    const d = stadtMetaDescription(bocholt, {
      stadtbezirke: [{ name: 'Bezirk 1' }, { name: 'Altstadt' }, { name: 'Bezirk 3' }],
    })
    expect(d).toContain('Altstadt')
    expect(d).not.toMatch(/Bezirk \d/)
  })

  it('haelt roemische Nummerierung genauso fuer nichtssagend (Essen: Stadtbezirk IX)', () => {
    const d = stadtMetaDescription(bocholt, {
      stadtbezirke: [{ name: 'Stadtbezirk IX' }, { name: 'Stadtbezirk I' }],
      hauptachsen: { autobahnen: ['A40'], bundesstrassen: [], knoten: [] },
    })
    expect(d).not.toContain('Stadtbezirk')
    expect(d).toContain('A40')
  })

  it('ueberspringt einen zu langen Namen, statt die Ortstiefe ganz aufzugeben', () => {
    // Real auf prod beobachtet: der Heilungslauf lieferte
    // "Ortsbezirk 1 – Innenstadt I (Mitte-Ost)" (38 Zeichen) — fuer den Namen
    // sind aber nur ~30 frei. Weil die Auswahl beim ERSTEN zu langen Namen
    // abbrach, fiel die ganze Beschreibung auf den Gerichts-Fallback zurueck,
    // obwohl zwoelf weitere Bezirke dahinterstanden. Der Ausfall sah aus wie
    // "diese Stadt hat halt keine Ortstiefe".
    const d = stadtMetaDescription(
      bocholt,
      tiefeMit('Ein Aussergewoehnlich Langer Bezirksname Ohne Praefix', 'Nordwest'),
    )
    expect(d).toContain('Nordwest')
    expect(d).not.toContain('Amtsgericht')
    expect(d.length).toBeLessThanOrEqual(MAX_META_LAENGE)
  })

  it('gewinnt durch das Kuerzen Platz fuer einen zweiten Bezirk', () => {
    const lang = stadtMetaDescription(
      bocholt,
      tiefeMit('Ortsbezirk 1 - Innenstadt I', 'Ortsbezirk 2 - Innenstadt II'),
    )
    expect(lang).toContain('Innenstadt I')
    expect(lang).toContain('Innenstadt II')
    expect(lang.length).toBeLessThanOrEqual(MAX_META_LAENGE)
  })
})
