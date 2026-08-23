import { describe, expect, it } from 'vitest'

import {
  MIN_SUBSTANZ_SCORE,
  findeAsciiUmlautErsatz,
  istBelastbareQuelle,
  istOrtsspezifischeFaq,
  pruefeLokalinhalt,
  type LokalinhaltEntwurf,
} from './gate'

/** Vollstaendiger, sauberer Entwurf als Ausgangspunkt fuer Varianten. */
function guterEntwurf(): LokalinhaltEntwurf {
  return {
    stadtbezirke: [{ name: 'Herne-Mitte', ortsteile: ['Baukau'] }],
    hauptachsen: { autobahnen: ['A42', 'A43'], bundesstrassen: ['B226'], knoten: ['Kreuz Herne'] },
    unfallHotspots: [
      {
        ort: 'Kreuzung Bahnhofstraße in Herne',
        beschreibung: 'Mehrere Auffahrunfälle im Berufsverkehr.',
        quelle: 'https://bochum.polizei.nrw/presse/beispielmeldung (Polizei Bochum, 01.02.2026)',
      },
    ],
    lokaleFaqs: [{ frage: 'Wer zahlt in Herne?', antwort: 'Die gegnerische Haftpflicht in Herne.' }],
  }
}

describe('istBelastbareQuelle', () => {
  it('akzeptiert absolute http(s)-URLs, auch mit Zusatz dahinter', () => {
    expect(istBelastbareQuelle('https://bonn.polizei.nrw/presse/x')).toBe(true)
    expect(istBelastbareQuelle('http://destatis.de/unfallatlas')).toBe(true)
    expect(istBelastbareQuelle('https://bonn.polizei.nrw/presse/x (Polizei Bonn, 30.01.2025)')).toBe(true)
  })

  it('lehnt ab, was ein Reviewer nicht nachschlagen kann', () => {
    expect(istBelastbareQuelle('Polizei Bonn')).toBe(false)
    expect(istBelastbareQuelle('/presse/meldung')).toBe(false)
    expect(istBelastbareQuelle('')).toBe(false)
    expect(istBelastbareQuelle(undefined)).toBe(false)
    expect(istBelastbareQuelle(null)).toBe(false)
    expect(istBelastbareQuelle(42)).toBe(false)
    expect(istBelastbareQuelle('ftp://irgendwo.de/datei')).toBe(false)
    expect(istBelastbareQuelle('https://localhost/presse')).toBe(false)
    expect(istBelastbareQuelle('https://intranet/presse')).toBe(false)
  })

  it('lehnt Platzhalter-Domains ab, die Modelle gern erfinden', () => {
    expect(istBelastbareQuelle('https://example.com/unfall')).toBe(false)
    expect(istBelastbareQuelle('https://www.beispiel.de/x')).toBe(false)
  })
})

describe('pruefeLokalinhalt — Quellenzwang', () => {
  it('verwirft einen Hotspot ohne Quelle, behaelt aber den Rest', () => {
    const e = guterEntwurf()
    e.unfallHotspots.push({
      ort: 'Erfundene Kreuzung in Herne',
      beschreibung: 'Angeblich Unfallschwerpunkt.',
      quelle: 'Polizeibericht',
    })

    const b = pruefeLokalinhalt(e, 'Herne')

    expect(b.bereinigt.unfallHotspots).toHaveLength(1)
    expect(b.bereinigt.unfallHotspots[0].ort).toContain('Bahnhofstraße')
    expect(b.verworfen.join(' ')).toContain('Erfundene Kreuzung')
    // Der Rest des Entwurfs bleibt nutzbar.
    expect(b.ok).toBe(true)
  })

  it('verwirft ALLE Hotspots, wenn keiner eine Quelle hat — Entwurf bleibt gueltig', () => {
    const e = guterEntwurf()
    e.unfallHotspots = [
      { ort: 'A in Herne', beschreibung: 'x', quelle: '' },
      { ort: 'B in Herne', beschreibung: 'y', quelle: 'laut Polizei' },
    ]

    const b = pruefeLokalinhalt(e, 'Herne')

    expect(b.bereinigt.unfallHotspots).toEqual([])
    expect(b.verworfen).toHaveLength(2)
    // Bezirke + Achsen + FAQs tragen den Entwurf weiterhin.
    expect(b.substanzScore).toBe(3)
    expect(b.ok).toBe(true)
  })

  it('verwirft Hotspots ohne Ort oder Beschreibung', () => {
    const e = guterEntwurf()
    e.unfallHotspots = [{ ort: '', beschreibung: 'x', quelle: 'https://polizei.nrw/x' }]
    const b = pruefeLokalinhalt(e, 'Herne')
    expect(b.bereinigt.unfallHotspots).toEqual([])
    expect(b.verworfen).toHaveLength(1)
  })

  it('uebernimmt das einzelfall-Flag nur als echtes true', () => {
    const e = guterEntwurf()
    e.unfallHotspots[0].einzelfall = true
    expect(pruefeLokalinhalt(e, 'Herne').bereinigt.unfallHotspots[0].einzelfall).toBe(true)

    const e2 = guterEntwurf()
    expect(pruefeLokalinhalt(e2, 'Herne').bereinigt.unfallHotspots[0].einzelfall).toBe(false)
  })
})

describe('pruefeLokalinhalt — Substanz-Gate', () => {
  it('zaehlt gefuellte Kategorien', () => {
    expect(pruefeLokalinhalt(guterEntwurf(), 'Herne').substanzScore).toBe(4)
  })

  it('blockt einen Entwurf unter der Mindest-Substanz', () => {
    // Kein Cast noetig — pruefeLokalinhalt nimmt bewusst Partial<...> entgegen,
    // weil ein Modell-Ergebnis unvollstaendig sein darf.
    const b = pruefeLokalinhalt({ stadtbezirke: [{ name: 'Herne-Mitte', ortsteile: [] }] }, 'Herne')
    expect(b.substanzScore).toBeLessThan(MIN_SUBSTANZ_SCORE)
    expect(b.ok).toBe(false)
    expect(b.gruende.join(' ')).toContain('Substanz-Score')
  })

  it('zaehlt Achsen nur bei Autobahn oder Bundesstrasse, nicht bei blossen Knoten', () => {
    const e = guterEntwurf()
    e.hauptachsen = { autobahnen: [], bundesstrassen: [], knoten: ['Irgendein Kreuz'] }
    // Bezirke + Hotspot + FAQ = 3, Achsen zaehlen nicht mit.
    expect(pruefeLokalinhalt(e, 'Herne').substanzScore).toBe(3)
  })
})

describe('pruefeLokalinhalt — Ortsbezug', () => {
  it('blockt einen Text, der die Stadt nicht einmal nennt', () => {
    const e = guterEntwurf()
    e.stadtbezirke = [{ name: 'Mitte', ortsteile: [] }]
    e.lokaleFaqs = [{ frage: 'Wer zahlt?', antwort: 'Die gegnerische Haftpflicht.' }]
    e.unfallHotspots = []

    const b = pruefeLokalinhalt(e, 'Herne')

    expect(b.ok).toBe(false)
    expect(b.gruende.join(' ')).toContain('Ortsbezug')
  })
})

describe('pruefeLokalinhalt — Robustheit gegen unvollstaendige Modell-Antworten', () => {
  it('verkraftet null/undefined', () => {
    const b = pruefeLokalinhalt(null, 'Herne')
    expect(b.ok).toBe(false)
    expect(b.substanzScore).toBe(0)
    expect(b.bereinigt.stadtbezirke).toEqual([])
  })

  it('verkraftet falsche Typen in allen Feldern', () => {
    const kaputt = {
      stadtbezirke: 'keine Liste',
      hauptachsen: null,
      unfallHotspots: 42,
      lokaleFaqs: { frage: 'x' },
    } as unknown as LokalinhaltEntwurf

    const b = pruefeLokalinhalt(kaputt, 'Herne')
    expect(b.substanzScore).toBe(0)
    expect(b.bereinigt.hauptachsen).toEqual({ autobahnen: [], bundesstrassen: [], knoten: [] })
  })

  it('filtert leere Eintraege aus Listen', () => {
    const e = guterEntwurf()
    e.stadtbezirke = [{ name: '', ortsteile: [] }, { name: 'Herne-Süd', ortsteile: [] }]
    // ⚠ Die verbleibende Antwort braucht seit 23.08. einen Ortsbezug, sonst
    // verwirft sie der Generik-Filter — dieser Test prueft aber das Filtern
    // LEERER Eintraege, nicht die Generik-Regel. Fixture entsprechend
    // angepasst; die Aussage des Tests bleibt unveraendert.
    e.lokaleFaqs = [
      { frage: 'Herne?', antwort: '' },
      { frage: 'Wo in Herne?', antwort: 'In Herne-Süd, direkt an der A42.' },
    ]

    const b = pruefeLokalinhalt(e, 'Herne')
    expect(b.bereinigt.stadtbezirke).toHaveLength(1)
    expect(b.bereinigt.lokaleFaqs).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Umlaut-Pflicht (19.08.2026)
//
// Der erste scharfe Cron-Lauf erzeugte fuenf Staedte. Das Modell schrieb
// NICHT-DETERMINISTISCH mal mit, mal ohne Umlaute — gemessen an den echten
// Zeilen auf prod:
//
//   berlin / koeln / muenchen : 43-124 echte Umlaute je Sorte   ✅
//   hamburg                   : 74x ä, ABER "Elbstrasse",
//                               "Fahrradstrassen", sogar
//                               "Strassenbaulasttraeger" + ä im selben Wort  ⚠
//   frankfurt                 : 0 ä, 0 ö, 0 ü, 0 ß auf 11.836 Zeichen        🔴
//                               ("buendelt", "koennen", "Kaiserstrasse", ...)
//
// Frankfurt ging so live. Der Prompt bittet bereits um Umlaute — deshalb muss
// das Gate es erzwingen, sonst wiederholt es sich taeglich (Muster wie beim
// Quellenzwang: bitten reicht nicht).
// ---------------------------------------------------------------------------
describe('findeAsciiUmlautErsatz', () => {
  it('findet die Muster aus dem echten frankfurt-Entwurf', () => {
    const treffer = findeAsciiUmlautErsatz('Frankfurt buendelt koennen haeufig Kaiserstrasse Fuer')
    expect(treffer).toEqual(expect.arrayContaining(['buendelt', 'koennen', 'haeufig', 'Kaiserstrasse', 'Fuer']))
  })

  it('laesst korrekt geschriebenen Text in Ruhe', () => {
    expect(findeAsciiUmlautErsatz('Die Straße führt über den Königsplatz — häufig größere Schäden.')).toEqual([])
  })

  it('flaggt NICHT das legitime ss nach kurzem Vokal', () => {
    // "Fluss", "muss", "Schloss", "Essen", "Kassel" sind korrekt mit ss.
    // Ein Scan auf blosses `ss` waere unbrauchbar.
    expect(findeAsciiUmlautErsatz('Der Fluss bei Schloss Essen, Kassel, dass es passt.')).toEqual([])
  })
})

describe('pruefeLokalinhalt — Umlaut-Pflicht', () => {
  /** Baut einen Entwurf mit genug Fliesstext, dass die Laengenschwelle greift. */
  function langerEntwurf(satz: string): LokalinhaltEntwurf {
    const e = guterEntwurf()
    e.lokaleFaqs = Array.from({ length: 12 }, (_, i) => ({
      frage: `Frage ${i} zu Herne?`,
      antwort: `${satz} ${satz} ${satz}`,
    }))
    return e
  }

  it('lehnt einen Entwurf ohne EINEN einzigen Umlaut ab (der frankfurt-Fall)', () => {
    const e = langerEntwurf(
      'Herne buendelt den Verkehr, Fahrzeuge koennen haeufig ueber die Kaiserstrasse fahren und Schaeden entstehen fuer Halter.',
    )
    const b = pruefeLokalinhalt(e, 'Herne')

    expect(b.ok).toBe(false)
    expect(b.gruende.join(' ')).toMatch(/Umlaut/i)
  })

  it('lehnt auch den GEMISCHTEN Fall ab (hamburg: echte Umlaute UND Strassen)', () => {
    const e = guterEntwurf()
    e.hauptachsen.knoten = ['Kreuzung Elbstrasse', 'Fahrradstrassen-Knoten']
    e.lokaleFaqs = [{ frage: 'Wer zahlt in Herne?', antwort: 'Die gegnerische Haftpflicht zahlt für Schäden.' }]

    const b = pruefeLokalinhalt(e, 'Herne')

    expect(b.ok).toBe(false)
    expect(b.gruende.join(' ')).toContain('Elbstrasse')
  })

  it('laesst korrekt geschriebene Entwuerfe durch (berlin/koeln/muenchen)', () => {
    const e = langerEntwurf(
      'In Herne führt die Straße über den Ring; häufig entstehen größere Schäden, die für Halter zählen.',
    )
    expect(pruefeLokalinhalt(e, 'Herne').ok).toBe(true)
  })

  it('schlaegt bei KURZEN Entwuerfen ohne Umlaut NICHT an', () => {
    // "Bonn, A565, B9, Nord" ist legitim umlautfrei. Die 0-Umlaut-Regel darf
    // erst greifen, wo deutscher Fliesstext ohne Umlaut praktisch unmoeglich ist.
    const e: LokalinhaltEntwurf = {
      stadtbezirke: [{ name: 'Bonn-Nord', ortsteile: ['Castell'] }],
      hauptachsen: { autobahnen: ['A565'], bundesstrassen: ['B9'], knoten: [] },
      unfallHotspots: [],
      lokaleFaqs: [{ frage: 'Wer zahlt in Bonn?', antwort: 'Die gegnerische Haftpflicht in Bonn.' }],
    }
    expect(pruefeLokalinhalt(e, 'Bonn').ok).toBe(true)
  })

  it('prueft die WERTE, nicht die JSON-Schluessel', () => {
    // `hauptachsen.bundesstrassen` ist ein Schluesselname im Schema und taucht
    // in JEDEM Entwurf auf — ein Scan ueber JSON.stringify() haette alle fuenf
    // Staedte geflaggt, auch die drei einwandfreien.
    const e = guterEntwurf()
    e.lokaleFaqs = [{ frage: 'Welche Straße in Herne?', antwort: 'Die B226 führt durch Herne.' }]
    expect(pruefeLokalinhalt(e, 'Herne').ok).toBe(true)
  })
})

describe('istOrtsspezifischeFaq', () => {
  // Kontext, wie ihn eine echte Stadt-Zeile mitbringt.
  const ORT = {
    stadtName: 'Dormagen',
    bezirke: ['Mitte', 'Zons', 'Nievenheim', 'Hackenbroich'],
    achsen: ['A57', 'B9'],
  }

  it('laesst eine Antwort MIT Ortsbezug durch', () => {
    expect(
      istOrtsspezifischeFaq(
        {
          frage: 'Was ist bei einem Lkw-Unfall an den Chempark-Zufahrten anders?',
          antwort:
            'Der Chempark bringt taeglich Schwerlastverkehr auf die B9 und die Zufahrten im Norden Dormagens.',
        },
        ORT,
      ),
    ).toBe(true)
  })

  it('blockt eine ortsfreie Antwort — auch wenn die FRAGE den Ort nennt', () => {
    // Genau das Muster, das 58-79 Mal in der Datenbank stand: der Ortsname
    // wandert in die Frage, die Antwort bleibt fuer jede Stadt gleich.
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Darf ich meine Werkstatt in Dormagen frei waehlen?', antwort: 'Ja, die freie Werkstattwahl bleibt bestehen.' },
        ORT,
      ),
    ).toBe(false)
  })

  it('blockt die Gerichts-Schablone, obwohl die Antwort den Ortsnamen traegt', () => {
    // Die zweite Klasse: eine Schablone mit eingesetztem DATENWERT. Das
    // Ortsbezug-Kriterium allein greift hier nicht — "Amtsgericht Dormagen"
    // enthaelt den Stadtnamen. Der Basis-Block beantwortet sie bereits.
    expect(
      istOrtsspezifischeFaq(
        {
          frage: 'Welches Gericht ist bei einem Verkehrsunfall in Dormagen zustaendig?',
          antwort: 'Bis 5.000 Euro das Amtsgericht Dormagen, darueber das Landgericht Neuss.',
        },
        ORT,
      ),
    ).toBe(false)
  })

  it('blockt die vor-Ort-Frist-Schablone trotz echter Ortsteile', () => {
    expect(
      istOrtsspezifischeFaq(
        {
          frage: 'Wie schnell ist ein Kfz-Gutachter in Dormagen vor Ort?',
          antwort:
            'Meist innerhalb von 24 bis 48 Stunden. Der Sachverstaendige kommt zu Ihnen — ob das Fahrzeug in Zons steht oder in Nievenheim.',
        },
        ORT,
      ),
    ).toBe(false)
  })

  it('akzeptiert einen Ortsteil als Bezug, auch ohne den Stadtnamen', () => {
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Was gilt in der Zollfeste?', antwort: 'Die engen Gassen in Zons fuehren zu Rangierschaeden an Felgen und Stossfaenger.' },
        ORT,
      ),
    ).toBe(true)
  })

  it('akzeptiert eine Achse als Bezug', () => {
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Unfall auf der Autobahn?', antwort: 'Auf der A57 sind Auffahrschaeden am Stauende typisch.' },
        ORT,
      ),
    ).toBe(true)
  })

  it('zaehlt einen Achsen-Treffer nur als ganzes Wort', () => {
    // "A57" darf nicht in "A570" oder in einer Hausnummer matchen.
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Was kostet das?', antwort: 'Die Kosten liegen zwischen 550 und 2.200 Euro je nach Schadenhoehe.' },
        ORT,
      ),
    ).toBe(false)
  })
})

describe('istOrtsspezifischeFaq — mehrteilige Stadtnamen', () => {
  it('erkennt die Kurzform eines mehrteiligen Namens', () => {
    // Die Stammdaten fuehren "Frankfurt am Main", der Fliesstext schreibt
    // "Frankfurt". Eine Pruefung nur auf den vollen Namen blockte eine
    // einwandfreie Ortsfrage — gemessen 23.08. am echten Bestand.
    expect(
      istOrtsspezifischeFaq(
        {
          frage: 'Wie wirkt sich der hohe Anteil an Firmenwagen aus?',
          antwort: 'Frankfurt ist Banken- und Messestandort; entsprechend haeufig sind Leasingfahrzeuge betroffen.',
        },
        { stadtName: 'Frankfurt am Main', bezirke: ['Sachsenhausen'], achsen: ['A5'] },
      ),
    ).toBe(true)
  })

  it('erkennt die Kurzform auch bei Praepositions-Namen', () => {
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Was gilt hier?', antwort: 'In Muelheim sind die Ruhrbruecken der Engpass.' },
        { stadtName: 'Mülheim an der Ruhr', bezirke: ['Broich'], achsen: ['A40'] },
      ),
    ).toBe(true)
  })

  it('zaehlt Fuellwoerter eines Namens NICHT als Ortsbezug', () => {
    // "am", "an", "der" stehen in fast jedem deutschen Satz. Wer sie als
    // Bezug zaehlt, laesst bei "Frankfurt am Main" jede beliebige Antwort durch.
    expect(
      istOrtsspezifischeFaq(
        { frage: 'Wer zahlt?', antwort: 'Der gegnerische Haftpflichtversicherer zahlt an den Geschaedigten.' },
        { stadtName: 'Frankfurt am Main', bezirke: [], achsen: [] },
      ),
    ).toBe(false)
  })
})
