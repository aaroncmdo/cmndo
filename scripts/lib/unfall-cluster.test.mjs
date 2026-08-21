import { describe, expect, it } from 'vitest'
import {
  spaltenIndizes, bildeAgs, clusterAusZeilen, waehleProStadt, baueAgsIndex, findeSlug,
} from './unfall-cluster.mjs'

// Die ECHTEN Kopfzeilen aller fuenf Jahrgaenge (am 21.08.2026 aus den Dateien
// gelesen, nicht nachgebaut). Sie sind der eigentliche Grund fuer dieses File.
const KOPF = {
  2021: 'OID_;ULAND;UREGBEZ;UKREIS;UGEMEINDE;UJAHR;UMONAT;USTUNDE;UWOCHENTAG;UKATEGORIE;UART;UTYP1;IstRad;IstPKW;IstFuss;IstKrad;IstSonstige;ULICHTVERH;IstGkfz;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84;UIDENTSTLAE;IstStrassenzustand',
  2022: 'OBJECTID;UIDENTSTLAE;ULAND;UREGBEZ;UKREIS;UGEMEINDE;UJAHR;UMONAT;USTUNDE;UWOCHENTAG;UKATEGORIE;UART;UTYP1;ULICHTVERH;IstStrassenzustand;IstRad;IstPKW;IstFuss;IstKrad;IstGkfz;IstSonstige;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84',
  2023: 'OID_;UIDENTSTLAE;ULAND;UREGBEZ;UKREIS;UGEMEINDE;UJAHR;UMONAT;USTUNDE;UWOCHENTAG;UKATEGORIE;UART;UTYP1;ULICHTVERH;IstStrassenzustand;IstRad;IstPKW;IstFuss;IstKrad;IstGkfz;IstSonstige;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84;PLST',
  2025: 'UIDENTSTLAE;ULAND;UREGBEZ;UKREIS;UGEMEINDE;UJAHR;UMONAT;USTUNDE;UWOCHENTAG;UKATEGORIE;UART;UTYP1;ULICHTVERH;IstStrassenzustand;IstRad;IstPKW;IstFuss;IstKrad;IstGkfz;IstSonstige;LINREFX;LINREFY;XGCSWGS84;YGCSWGS84;PLST',
}

describe('spaltenIndizes', () => {
  it('findet die Koordinaten in JEDEM Jahrgang — sie liegen woanders', () => {
    // Das ist der Kern: 2021 X=21, 2022/2023 X=23, 2025 X=22. Ein fester Index
    // laese in drei von vier Jahrgaengen LINREFX — plausible Zahlen, falscher Ort.
    expect(spaltenIndizes(KOPF[2021]).XGCSWGS84).toBe(21)
    expect(spaltenIndizes(KOPF[2022]).XGCSWGS84).toBe(23)
    expect(spaltenIndizes(KOPF[2023]).XGCSWGS84).toBe(23)
    expect(spaltenIndizes(KOPF[2025]).XGCSWGS84).toBe(22)
  })

  it('erkennt auch die vertauschte Reihenfolge von 2021', () => {
    // 2021 hat ULICHTVERH HINTER IstSonstige, ab 2022 davor — es sind nicht
    // bloss zusaetzliche Spalten, die Reihenfolge selbst wechselt.
    expect(spaltenIndizes(KOPF[2021]).UKATEGORIE).toBe(9)
    expect(spaltenIndizes(KOPF[2022]).UKATEGORIE).toBe(10)
  })

  it('wirft bei fehlender Spalte, statt still 0 Treffer zu liefern', () => {
    expect(() => spaltenIndizes('ULAND;UREGBEZ;UKREIS')).toThrow(/UGEMEINDE fehlt/)
  })

  it('vertraegt das BOM am Dateianfang', () => {
    expect(spaltenIndizes(`﻿${KOPF[2025]}`).ULAND).toBe(1)
  })
})

describe('bildeAgs', () => {
  it('baut den 8-stelligen Schluessel — Kontrollwerte aus den Rohdaten', () => {
    expect(bildeAgs('05', '3', '15', '000')).toBe('05315000') // Koeln
    expect(bildeAgs('09', '1', '62', '000')).toBe('09162000') // Muenchen
    expect(bildeAgs('05', '5', '54', '008')).toBe('05554008') // Bocholt
  })

  it('fuellt fuehrende Nullen auf, wie sie in der CSV fehlen koennen', () => {
    expect(bildeAgs('5', '3', '15', '0')).toBe('05315000')
  })

  it('ergibt NIE 9 Stellen — eine Null zuviel trifft nichts', () => {
    // Der teure Fehler: 9-stellig sieht aus wie „diese Stadt hat keine
    // Unfaelle", nicht wie ein Fehler.
    for (const a of [bildeAgs('05', '3', '15', '000'), bildeAgs('16', '0', '77', '001')]) {
      expect(a).toHaveLength(8)
    }
  })
})

describe('baueAgsIndex / findeSlug — die Stadtstaaten-Falle', () => {
  const index = baueAgsIndex(new Map([
    ['05315000', 'koeln'],
    ['04011000', 'bremen'],
    ['11000000', 'berlin'],   // Gesamtstadt-Schluessel
    ['02000000', 'hamburg'],  // Gesamtstadt-Schluessel
  ]))

  it('findet Berlin ueber die BEZIRKS-Schluessel des Unfallatlas', () => {
    // Der Atlas kennt kein 11000000 — nur 11001001 (Mitte) bis 11012012.
    // Ohne diese Aufloesung bliebe die groesste Stadtseite Deutschlands leer,
    // ohne dass irgendetwas fehlschlaegt.
    expect(findeSlug(index, '11001001')).toBe('berlin')
    expect(findeSlug(index, '11012012')).toBe('berlin')
  })

  it('findet Hamburg über seine ~180 Teilschluessel', () => {
    expect(findeSlug(index, '02518526')).toBe('hamburg')
    expect(findeSlug(index, '02112130')).toBe('hamburg')
  })

  it('loest Bremen weiterhin EXAKT auf — es ist kein Sonderfall', () => {
    // Bremen hat mit 04011000 einen echten Gemeindeschluessel. Waere es als
    // Bundesland-Praefix behandelt, schluckte es Bremerhaven mit.
    expect(findeSlug(index, '04011000')).toBe('bremen')
    expect(findeSlug(index, '04012000')).toBeNull() // Bremerhaven, nicht gefuehrt
  })

  it('verwechselt keine Stadt mit ihrem Bundesland-Nachbarn', () => {
    expect(findeSlug(index, '05315000')).toBe('koeln')
    expect(findeSlug(index, '05334002')).toBeNull() // anderer Kreis in NRW
  })
})

describe('clusterAusZeilen', () => {
  const agsZuSlug = new Map([['05315000', 'koeln']])

  function zeile(jahr, { lat, lng, kat = 3 }) {
    const kopf = KOPF[jahr].split(';')
    const s = new Array(kopf.length).fill('0')
    const setze = (n, v) => (s[kopf.indexOf(n)] = v)
    setze('ULAND', '05'); setze('UREGBEZ', '3'); setze('UKREIS', '15'); setze('UGEMEINDE', '000')
    setze('XGCSWGS84', String(lng).replace('.', ','))
    setze('YGCSWGS84', String(lat).replace('.', ','))
    setze('UKATEGORIE', String(kat))
    return s.join(';')
  }

  it('zaehlt Unfaelle derselben Zelle zusammen — jahrgangsuebergreifend', () => {
    const proStadt = new Map()
    clusterAusZeilen([KOPF[2021], zeile(2021, { lat: 50.9310, lng: 6.9406 })].join('\n'), agsZuSlug, proStadt)
    clusterAusZeilen([KOPF[2025], zeile(2025, { lat: 50.9311, lng: 6.9407 })].join('\n'), agsZuSlug, proStadt)
    const zellen = [...proStadt.get('koeln').values()]
    expect(zellen).toHaveLength(1)
    expect(zellen[0].n).toBe(2)
  })

  it('trennt Kategorien: Getoetete und Schwerverletzte einzeln', () => {
    const proStadt = new Map()
    const zs = [
      zeile(2025, { lat: 50.931, lng: 6.9406, kat: 1 }),
      zeile(2025, { lat: 50.931, lng: 6.9406, kat: 2 }),
      zeile(2025, { lat: 50.931, lng: 6.9406, kat: 3 }),
    ]
    clusterAusZeilen([KOPF[2025], ...zs].join('\n'), agsZuSlug, proStadt)
    const c = [...proStadt.get('koeln').values()][0]
    expect({ n: c.n, tote: c.tote, schwer: c.schwer }).toEqual({ n: 3, tote: 1, schwer: 1 })
  })

  it('ignoriert Staedte, die wir nicht fuehren', () => {
    const proStadt = new Map()
    const n = clusterAusZeilen([KOPF[2025], zeile(2025, { lat: 50.931, lng: 6.9406 })].join('\n'), new Map(), proStadt)
    expect(n).toBe(0)
    expect(proStadt.size).toBe(0)
  })

  it('liest deutsche Dezimalkommata als Koordinate', () => {
    const proStadt = new Map()
    clusterAusZeilen([KOPF[2025], zeile(2025, { lat: 50.93106, lng: 6.94066 })].join('\n'), agsZuSlug, proStadt)
    const c = [...proStadt.get('koeln').values()][0]
    expect(c.latSum).toBeCloseTo(50.93106, 4)
    expect(c.lngSum).toBeCloseTo(6.94066, 4)
  })
})

describe('waehleProStadt', () => {
  const zelle = (n, lat, lng) => ({ n, schwer: 0, tote: 0, latSum: lat * n, lngSum: lng * n })

  it('verwirft alles unter der Schwelle', () => {
    const proStadt = new Map([['koeln', new Map([['a', zelle(9, 50.9, 6.9)]])]])
    expect(waehleProStadt(proStadt, 10, 3)).toEqual([])
  })

  it('nimmt die staerkste Haeufung zuerst', () => {
    const proStadt = new Map([['koeln', new Map([
      ['a', zelle(12, 50.90, 6.90)],
      ['b', zelle(40, 50.95, 6.99)],
    ])]])
    expect(waehleProStadt(proStadt, 10, 3).map((c) => c.n)).toEqual([40, 12])
  })

  it('nennt dieselbe Kreuzung nicht zweimal', () => {
    // Zwei Zellen 100 m auseinander sind derselbe Knoten — mit zwei
    // Strassennamen sieht es nach zwei Befunden aus.
    const proStadt = new Map([['koeln', new Map([
      ['a', zelle(40, 50.9310, 6.9406)],
      ['b', zelle(30, 50.9312, 6.9409)],
    ])]])
    expect(waehleProStadt(proStadt, 10, 3)).toHaveLength(1)
  })

  it('begrenzt auf die gewuenschte Anzahl je Stadt', () => {
    const zellen = new Map()
    for (let i = 0; i < 8; i++) zellen.set(`z${i}`, zelle(20 + i, 50.9 + i * 0.02, 6.9 + i * 0.02))
    expect(waehleProStadt(new Map([['koeln', zellen]]), 10, 3)).toHaveLength(3)
  })
})
