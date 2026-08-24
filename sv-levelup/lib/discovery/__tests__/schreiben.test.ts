import { describe, expect, it } from 'vitest'
import { beurteile, plzUndOrt, schreibeFund, type BestandsZeile, type Fund } from '../schreiben'
import type { Db } from '../../anreicherung/schreiben'

const FUND: Fund = {
  placeId: 'p-neu',
  name: 'Sachverständigenbüro Meyer',
  adresse: 'Weseler Str. 675 B, 48163 Münster, Deutschland',
  lat: 51.92,
  lng: 7.61,
}

function bestand(over: Partial<BestandsZeile> = {}): BestandsZeile {
  return {
    id: 'l1', firma: 'Sachverständigenbüro Meyer', lat: 51.92, lng: 7.61,
    googlePlaceId: null, ...over,
  }
}

describe('plzUndOrt', () => {
  it('liest Postleitzahl und Ort aus einer deutschen Anschrift', () => {
    expect(plzUndOrt('Weseler Str. 675 B, 48163 Münster, Deutschland'))
      .toEqual({ plz: '48163', ort: 'Münster' })
  })

  it('kommt mit einem zusammengesetzten Ortsnamen zurecht', () => {
    expect(plzUndOrt('Hauptstr. 1, 51515 Kürten-Biesfeld, Deutschland').ort)
      .toBe('Kürten-Biesfeld')
  })

  it('liefert null, wo nichts steht', () => {
    expect(plzUndOrt(null)).toEqual({ plz: null, ort: null })
    expect(plzUndOrt('Deutschland')).toEqual({ plz: null, ort: null })
  })
})

describe('beurteile', () => {
  it('erkennt eine harte Dublette an der Place-Kennung', () => {
    const e = beurteile(FUND, [bestand({ googlePlaceId: 'p-neu', firma: 'Ganz anderer Name' })])
    expect(e).toBe('dublette_place_id')
  })

  it('erkennt eine weiche Dublette an Name und Umkreis', () => {
    expect(beurteile(FUND, [bestand()])).toBe('dublette_name')
  })

  it('haelt denselben Namen weit entfernt fuer einen anderen Betrieb', () => {
    // Köln ist rund 120 km entfernt — dort sitzt ein anderes Büro.
    expect(beurteile(FUND, [bestand({ lat: 50.94, lng: 6.96 })])).toBe('neu')
  })

  it('nimmt einen unbekannten Betrieb an', () => {
    expect(beurteile(FUND, [bestand({ firma: 'Ingenieurbüro Schulz' })])).toBe('neu')
  })

  it('verwirft einen Fund ohne brauchbaren Namen', () => {
    expect(beurteile({ ...FUND, name: 'Kfz' }, [])).toBe('unbrauchbar')
    expect(beurteile({ ...FUND, name: '' }, [])).toBe('unbrauchbar')
  })

  it('nimmt Bueros mit kurzem EIGENnamen an', () => {
    // ⚠ Am Muensterland-Trockenlauf gefunden: die erste Fassung pruefte den
    // KERN (nach Abzug der Gattungswoerter) gegen vier Zeichen und warf
    // 14 von 188 echten Bueros weg. Uebrig blieb bei ihnen „HM", „Zad",
    // „BSV", „ELO", „Tas" — der Name selbst ist lang genug.
    for (const name of [
      'HM-KFZ-Gutachter',
      'KFZ Sachverständiger Büro Zad',
      'KFZ-Sachverständigenbüro ELO',
      'KFZ-BSV',
      'Sachverständigen- & Ingenieurbüro Tas',
      'MSV | KFZ Sachverständiger',
    ]) {
      expect(beurteile({ ...FUND, name, placeId: `p-${name}` }, []), name).toBe('neu')
    }
  })

  it('vergleicht Dubletten weiterhin ueber den Kern', () => {
    // Die Kern-Regel bleibt dort richtig, wo sie herkommt: zwei Betriebe, die
    // nur aus Gattungswoertern bestehen, sind NICHT derselbe.
    const a: Fund = { ...FUND, name: 'Kfz-Sachverständigenbüro', placeId: 'p-a' }
    expect(beurteile(a, [bestand({ firma: 'Sachverständigenbüro', googlePlaceId: 'p-b' })]))
      .toBe('neu')
  })

  it('verwirft einen Fund ohne Koordinaten', () => {
    // ⚠ Ein Datensatz ohne Ort ist im Vertrieb wertlos (kein Umkreis) und auf
    // der Karte ein Stift im Nirgendwo.
    expect(beurteile({ ...FUND, lat: 0, lng: 0 }, [])).toBe('unbrauchbar')
  })
})

describe('schreibeFund', () => {
  function db() {
    const eingefuegt: Record<string, unknown>[] = []
    const aktualisiert: Record<string, unknown>[] = []
    return {
      db: {
        from: () => ({
          insert: (w: Record<string, unknown>) => {
            eingefuegt.push(w)
            return { select: async () => ({ data: [{ id: 'neu' }], error: null }) }
          },
          update: (w: Record<string, unknown>) => {
            aktualisiert.push(w)
            return { eq: () => ({ select: async () => ({ data: [{ id: 'l1' }], error: null }) }) }
          },
        }),
      } as unknown as Db,
      eingefuegt,
      aktualisiert,
    }
  }

  it('legt einen neuen Lead inaktiv an', async () => {
    const { db: v, eingefuegt } = db()
    await schreibeFund(v, FUND, 'lauf-1', 'neu', null)
    const zeile = eingefuegt[0]

    // ⚠ Der Vorgabewert der Spalte ist `true`. Ohne dieses ausdrueckliche
    // `false` erschiene jeder entdeckte Betrieb sofort auf den oeffentlichen
    // Karten — auch im Embed auf FREMDEN Websites.
    expect(zeile.ist_aktiv).toBe(false)
    expect(zeile.quelle).toBe('places_discovery')
    expect(zeile.google_place_id).toBe('p-neu')
    expect(zeile.entdeckt_lauf).toBe('lauf-1')
    expect(zeile.name).toBe('Sachverständigenbüro Meyer')
    expect(zeile.plz).toBe('48163')
    expect(zeile.ort).toBe('Münster')
  })

  it('schickt normalized_name NICHT mit', async () => {
    // ⚠ Die Spalte ist GENERATED ALWAYS. Ein Insert, der sie mitschickt,
    // schlaegt fehl — und zwar fuer JEDEN Datensatz des Laufs.
    const { db: v, eingefuegt } = db()
    await schreibeFund(v, FUND, 'lauf-1', 'neu', null)
    expect(Object.keys(eingefuegt[0])).not.toContain('normalized_name')
  })

  it('traegt die Place-Kennung an einer weichen Dublette nach', async () => {
    // So wird die weiche Dublette beim naechsten Lauf zur harten.
    const { db: v, eingefuegt, aktualisiert } = db()
    await schreibeFund(v, FUND, 'lauf-1', 'dublette_name', bestand())
    expect(eingefuegt).toHaveLength(0)
    expect(aktualisiert[0]).toEqual({ google_place_id: 'p-neu' })
  })

  it('laesst eine Dublette in Ruhe, die schon eine Kennung hat', async () => {
    const { db: v, aktualisiert } = db()
    await schreibeFund(v, FUND, 'lauf-1', 'dublette_name', bestand({ googlePlaceId: 'p-alt' }))
    expect(aktualisiert).toHaveLength(0)
  })

  it('schreibt bei einer harten Dublette gar nichts', async () => {
    const { db: v, eingefuegt, aktualisiert } = db()
    await schreibeFund(v, FUND, 'lauf-1', 'dublette_place_id', bestand({ googlePlaceId: 'p-neu' }))
    expect(eingefuegt).toHaveLength(0)
    expect(aktualisiert).toHaveLength(0)
  })
})

describe('Ortsnamen mit Sonderzeichen', () => {
  it('liest Orte mit Schraegstrich und Klammern', () => {
    // ⚠ Am echten Scrape gefunden (20.08.): 46 deutsche Betriebe blieben ohne
    // Ort, weil das Muster weder `/` noch Klammern erlaubte. Beides ist in
    // amtlichen Ortsnamen voellig normal.
    expect(plzUndOrt('Ernst-Thälmann-Straße 114D, 15517 Fürstenwalde/Spree'))
      .toEqual({ plz: '15517', ort: 'Fürstenwalde/Spree' })
    expect(plzUndOrt('Wiggensbacher Str. 57, 87439 Kempten (Allgäu)'))
      .toEqual({ plz: '87439', ort: 'Kempten (Allgäu)' })
    expect(plzUndOrt('Hans-Lingl-Str. 15 B, 86381 Krumbach (Schwaben)').ort)
      .toBe('Krumbach (Schwaben)')
  })

  it('liest weiterhin gewoehnliche Orte', () => {
    expect(plzUndOrt('Nunnensteig 5, 78052 Villingen-Schwenningen').ort)
      .toBe('Villingen-Schwenningen')
    expect(plzUndOrt('Stuttgarter Str. 79, 73312 Geislingen an der Steige').ort)
      .toBe('Geislingen an der Steige')
  })
})

describe('Betriebe im Ausland', () => {
  it('verwirft sie', () => {
    // ⚠ Der Deutschland-Rahmen ist ein RECHTECK und schliesst die Nachbarlaender
    // ein. Der Scrape holte 92 oesterreichische, 3 Schweizer und einen
    // tschechischen Betrieb — sie gehoeren nicht in einen deutschen
    // Gutachter-Bestand und erst recht nicht auf eine deutsche Karte.
    for (const adresse of [
      'Hochsteingasse 13, 8010 Graz, Österreich',
      'Judendorf 19, 9360 Friesach, Österreich',
      'Bahnhofstrasse 1, 8001 Zürich, Schweiz',
      'Nádražní 1, 110 00 Praha, Tschechien',
    ]) {
      expect(beurteile({ ...FUND, adresse, placeId: `p-${adresse}` }, []), adresse)
        .toBe('unbrauchbar')
    }
  })

  it('laesst deutsche Anschriften durch — auch ohne „Deutschland" am Ende', () => {
    // Google haengt das Land bei einer Anfrage aus Deutschland oft NICHT an.
    // Wer auf „Deutschland" besteht, verwirft fast alles.
    expect(beurteile({ ...FUND, adresse: 'Nunnensteig 5, 78052 Villingen-Schwenningen' }, []))
      .toBe('neu')
  })
})
