import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GROSSSTADT_AB_EINWOHNER,
  NACHBAR_MAX_KM,
  distanzKm,
  einwohnerZahl,
  naechsteAus,
  naechsteStaedte,
} from './nachbarstaedte'
import { STAEDTE } from './staedte'

const NRW = STAEDTE.filter((s) => s.bundesland === 'Nordrhein-Westfalen').map((s) => s.slug)

describe('distanzKm', () => {
  it('rechnet Koeln -> Duesseldorf auf ~34 km', () => {
    const koeln = STAEDTE.find((s) => s.slug === 'koeln')!
    const duesseldorf = STAEDTE.find((s) => s.slug === 'duesseldorf')!
    expect(distanzKm(koeln, duesseldorf)).toBeGreaterThan(30)
    expect(distanzKm(koeln, duesseldorf)).toBeLessThan(38)
  })

  it('ist symmetrisch und fuer denselben Punkt null', () => {
    const berlin = STAEDTE.find((s) => s.slug === 'berlin')!
    const hamburg = STAEDTE.find((s) => s.slug === 'hamburg')!
    expect(distanzKm(berlin, hamburg)).toBeCloseTo(distanzKm(hamburg, berlin), 9)
    expect(distanzKm(berlin, berlin)).toBe(0)
  })
})

describe('einwohnerZahl', () => {
  it('liest das Tsd.-Format', () => {
    expect(einwohnerZahl('165 Tsd.')).toBe(165_000)
    expect(einwohnerZahl('49 Tsd.')).toBe(49_000)
  })

  it('liest das Mio.-Format mit deutschem Dezimalkomma', () => {
    expect(einwohnerZahl('3,7 Mio.')).toBe(3_700_000)
    expect(einwohnerZahl('1,1 Mio.')).toBe(1_100_000)
  })

  it('liefert 0 statt NaN bei unbekanntem Format', () => {
    expect(einwohnerZahl('keine Angabe')).toBe(0)
    expect(einwohnerZahl('')).toBe(0)
  })

  it('kann jede der 92 gepflegten Einwohnerzahlen lesen', () => {
    const unlesbar = STAEDTE.filter((s) => einwohnerZahl(s.bevoelkerung) === 0)
    expect(unlesbar.map((s) => `${s.slug}=${s.bevoelkerung}`)).toEqual([])
  })
})

describe('naechsteStaedte — der behobene Fehler', () => {
  it('gibt Berlin keine einzige NRW-Stadt mehr', () => {
    const treffer = naechsteStaedte('berlin').map((s) => s.slug)
    expect(treffer.filter((slug) => NRW.includes(slug))).toEqual([])
  })

  it('gibt Hamburg keine einzige NRW-Stadt mehr', () => {
    const treffer = naechsteStaedte('hamburg').map((s) => s.slug)
    expect(treffer.filter((slug) => NRW.includes(slug))).toEqual([])
  })

  it('haelt fuer JEDE Stadt die Umkreis-Grenze ein', () => {
    const verstoesse: string[] = []
    for (const s of STAEDTE) {
      for (const n of naechsteStaedte(s.slug)) {
        const km = distanzKm(s, n)
        if (km > NACHBAR_MAX_KM) verstoesse.push(`${s.slug}->${n.slug} ${km.toFixed(0)}km`)
      }
    }
    expect(verstoesse).toEqual([])
  })
})

describe('naechsteStaedte — Grossstadt-Garantie (Gegenprobe Koeln)', () => {
  it('behaelt fuer Koeln Bonn, Duesseldorf und Leverkusen', () => {
    const treffer = naechsteStaedte('koeln').map((s) => s.slug)
    expect(treffer).toContain('leverkusen')
    expect(treffer).toContain('bonn')
    expect(treffer).toContain('duesseldorf')
  })

  it('gibt Duesseldorf die naechsten Grossstaedte statt nur Kleinstaedte', () => {
    const treffer = naechsteStaedte('duesseldorf').map((s) => s.slug)
    expect(treffer).toContain('krefeld')
    expect(treffer).toContain('duisburg')
  })

  it('erzeugt in der Rheinschiene bewusst eine einseitige Kante Koeln -> Duesseldorf', () => {
    // Dokumentierter Befund, kein Versehen: Duesseldorf hat SECHS Grossstaedte
    // naeher als Koeln (Krefeld 18, Duisburg 23, MG 24, Wuppertal 26, Essen 30,
    // Oberhausen 31 km — Koeln erst 34). Reziprozitaet ueber alle Kanten zu
    // erzwingen waere zirkulaer; sie gehoert in den Hub-Spoke-Block (P3-A2) und
    // wird vom Linknetz-Pruefskript (P3-A3) gemessen, nicht hier erzwungen.
    expect(naechsteStaedte('koeln').map((s) => s.slug)).toContain('duesseldorf')
    expect(naechsteStaedte('duesseldorf').map((s) => s.slug)).not.toContain('koeln')
  })

  it('nimmt bei Koeln trotzdem die allernaechsten Orte mit', () => {
    const treffer = naechsteStaedte('koeln').map((s) => s.slug)
    expect(treffer).toContain('leverkusen')
    expect(treffer).toContain('bergisch-gladbach')
  })
})

describe('naechsteStaedte — Vertrag', () => {
  it('schliesst die Stadt selbst aus (alle 92 geprueft)', () => {
    const verstoesse = STAEDTE.filter((s) =>
      naechsteStaedte(s.slug).some((n) => n.slug === s.slug),
    )
    expect(verstoesse.map((s) => s.slug)).toEqual([])
  })

  it('haelt das limit ein', () => {
    expect(naechsteStaedte('koeln', 3)).toHaveLength(3)
    expect(naechsteStaedte('koeln', 1)).toHaveLength(1)
    expect(naechsteStaedte('koeln', 0)).toHaveLength(0)
  })

  it('liefert jeder der 92 Staedte volle 6 Nachbarn (keine Waise durch die Grenze)', () => {
    const zuWenig = STAEDTE.filter((s) => naechsteStaedte(s.slug).length < 6)
    expect(zuWenig.map((s) => `${s.slug}=${naechsteStaedte(s.slug).length}`)).toEqual([])
  })

  it('sortiert das Ergebnis aufsteigend nach Distanz', () => {
    for (const s of STAEDTE) {
      const km = naechsteStaedte(s.slug).map((n) => distanzKm(s, n))
      expect(km).toEqual([...km].sort((a, b) => a - b))
    }
  })

  it('liefert fuer einen unbekannten Slug ein leeres Array statt zu werfen', () => {
    expect(naechsteStaedte('gibt-es-nicht')).toEqual([])
  })

  it('ist zwischen zwei Aufrufen stabil', () => {
    expect(naechsteStaedte('essen').map((s) => s.slug)).toEqual(
      naechsteStaedte('essen').map((s) => s.slug),
    )
  })
})

describe('naechsteAus — deterministischer Tie-Break', () => {
  // Vier Kandidaten exakt gleich weit von der Basis entfernt (gleicher Breitengrad,
  // symmetrische Laengengrade). Ohne Tie-Break entschiede die Array-Reihenfolge.
  const gleichWeit = [
    { slug: 'basis', lat: 50, lng: 10, bevoelkerung: '100 Tsd.' },
    { slug: 'delta', lat: 50, lng: 11, bevoelkerung: '100 Tsd.' },
    { slug: 'bravo', lat: 50, lng: 9, bevoelkerung: '100 Tsd.' },
    { slug: 'charlie', lat: 51, lng: 10, bevoelkerung: '100 Tsd.' },
    { slug: 'alpha', lat: 49, lng: 10, bevoelkerung: '100 Tsd.' },
  ]

  it('sortiert gleich weit entfernte Orte alphabetisch nach slug', () => {
    const treffer = naechsteAus('basis', gleichWeit, 4).map((s) => s.slug)
    // charlie/alpha liegen exakt 1 Breitengrad entfernt (~111 km), bravo/delta
    // 1 Laengengrad (~72 km bei 50 Grad Nord) — innerhalb der Paare entscheidet der slug.
    expect(treffer).toEqual(['bravo', 'delta', 'alpha', 'charlie'])
  })

  it('ist unabhaengig von der Reihenfolge der Eingabeliste', () => {
    const umgedreht = [...gleichWeit].reverse()
    expect(naechsteAus('basis', gleichWeit, 4).map((s) => s.slug)).toEqual(
      naechsteAus('basis', umgedreht, 4).map((s) => s.slug),
    )
  })

  it('kappt Kandidaten jenseits der Umkreis-Grenze', () => {
    const weitWeg = [
      { slug: 'basis', lat: 50, lng: 10, bevoelkerung: '100 Tsd.' },
      { slug: 'nah', lat: 50.1, lng: 10, bevoelkerung: '100 Tsd.' },
      { slug: 'fern', lat: 60, lng: 10, bevoelkerung: '900 Tsd.' },
    ]
    expect(naechsteAus('basis', weitWeg, 6).map((s) => s.slug)).toEqual(['nah'])
  })

  it('zieht eine Grossstadt einer naeheren Kleinstadt vor, wenn die Nahplaetze belegt sind', () => {
    const gemischt = [
      { slug: 'basis', lat: 50, lng: 10, bevoelkerung: '100 Tsd.' },
      { slug: 'klein-a', lat: 50.05, lng: 10, bevoelkerung: '20 Tsd.' },
      { slug: 'klein-b', lat: 50.06, lng: 10, bevoelkerung: '20 Tsd.' },
      { slug: 'klein-c', lat: 50.07, lng: 10, bevoelkerung: '20 Tsd.' },
      { slug: 'gross', lat: 50.5, lng: 10, bevoelkerung: '600 Tsd.' },
    ]
    const treffer = naechsteAus('basis', gemischt, 2).map((s) => s.slug)
    expect(treffer).toContain('gross')
    expect(treffer).toContain('klein-a')
  })

  it('setzt die Grossstadt-Schwelle bei 200.000 Einwohnern an', () => {
    expect(GROSSSTADT_AB_EINWOHNER).toBe(200_000)
  })
})

describe('Snapshot-Kopplung zu src/lib/lokalinhalt/staedte-stammdaten.json', () => {
  // Der Admin-Generator in src/ bekommt die Nachbarorte als vorberechneten Snapshot
  // (scripts/build-stadt-stammdaten.mjs), weil src/ die Marketing-Staedteliste nicht
  // importieren kann. Laufen beide auseinander, zeigt die Seite andere Nachbarn als
  // der KI-Prompt kennt. Dieser Test ist die einzige Klammer, die das verhindert.
  const snapshotPfad = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'src',
    'lib',
    'lokalinhalt',
    'staedte-stammdaten.json',
  )

  it('stimmt fuer alle 92 Staedte mit den vorberechneten nachbarorte ueberein', () => {
    const snapshot = JSON.parse(readFileSync(snapshotPfad, 'utf8')) as Array<{
      slug: string
      nachbarorte: string[]
    }>
    expect(snapshot).toHaveLength(STAEDTE.length)

    const abweichungen = snapshot
      .map((eintrag) => ({
        slug: eintrag.slug,
        snapshot: eintrag.nachbarorte,
        lib: naechsteStaedte(eintrag.slug, 6).map((s) => s.name),
      }))
      .filter((x) => x.snapshot.join('|') !== x.lib.join('|'))

    expect(abweichungen).toEqual([])
  })
})
