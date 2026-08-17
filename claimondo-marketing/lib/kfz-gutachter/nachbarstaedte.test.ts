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
  nachbarnMitRueckkanten,
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

  it('zeigt Duesseldorf Koeln als Rueckkante, obwohl es die Distanzwahl nicht traf', () => {
    // Duesseldorf hat SECHS Grossstaedte naeher als Koeln (Krefeld 18,
    // Duisburg 23, MG 24, Wuppertal 26, Essen 30, Oberhausen 31 km — Koeln
    // erst 34). Koeln waehlt Duesseldorf aber, und Nachbarschaft ist
    // symmetrisch — also erscheint Koeln als Rueckkante.
    expect(naechsteAus('duesseldorf', STAEDTE, 6).map((s) => s.slug)).not.toContain('koeln')
    expect(naechsteStaedte('duesseldorf').map((s) => s.slug)).toContain('koeln')
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

  it('steuert mit limit die GEWAEHLTEN — Rueckkanten kommen zusaetzlich', () => {
    // Das Limit begrenzt, wie viele Orte eine Stadt selbst waehlt. Wer sie
    // gewaehlt hat, kommt oben drauf: sonst waere die Kante wieder einseitig.
    expect(naechsteAus('koeln', STAEDTE, 3)).toHaveLength(3)
    expect(naechsteAus('koeln', STAEDTE, 0)).toHaveLength(0)
    expect(naechsteStaedte('koeln', 3).length).toBeGreaterThanOrEqual(3)
  })

  it('liefert jeder der 92 Staedte mindestens 6 Nachbarn', () => {
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

describe('Reziprozitaet — Nachbarschaft ist symmetrisch', () => {
  // Aaron-Entscheid 16.08.: der Block zeigt die selbst gewaehlten Orte UND die,
  // die einen selbst gewaehlt haben. Ohne das bleibt jede Stadt unsichtbar, die
  // zwar Nachbarn hat, aber bei keinem von ihnen unter die naechsten faellt.

  it('hat KEINE einseitige Kante mehr — A zeigt B, also zeigt B auch A', () => {
    const netz = new Map(STAEDTE.map((s) => [s.slug, naechsteStaedte(s.slug).map((n) => n.slug)]))
    const einseitig: string[] = []
    for (const [von, ziele] of netz) {
      for (const nach of ziele) {
        if (!netz.get(nach)?.includes(von)) einseitig.push(`${von}->${nach}`)
      }
    }
    expect(einseitig).toEqual([])
  })

  it('laesst keine Stadt ohne eingehenden Link zurueck', () => {
    const eingehend = new Set<string>()
    for (const s of STAEDTE) for (const n of naechsteStaedte(s.slug)) eingehend.add(n.slug)
    const waisen = STAEDTE.filter((s) => !eingehend.has(s.slug)).map((s) => s.slug)
    expect(waisen).toEqual([])
  })

  it('rettet siegen — die Stadt, die vorher niemand waehlte', () => {
    // siegen liegt am NRW-Rand; alle seine Nachbarn haben Naeheres. Vor der
    // Reziprozitaet war es die einzige Waise unter 92 Staedten.
    expect(STAEDTE.filter((s) => naechsteAus(s.slug, STAEDTE, 6).some((n) => n.slug === 'siegen')))
      .toEqual([])
    const zeigenSiegen = STAEDTE.filter((s) =>
      naechsteStaedte(s.slug).some((n) => n.slug === 'siegen'),
    ).map((s) => s.slug)
    expect(zeigenSiegen.length).toBeGreaterThan(0)
    // Genau die, die siegen selbst gewaehlt hat.
    expect(zeigenSiegen.sort()).toEqual(
      naechsteAus('siegen', STAEDTE, 6)
        .map((n) => n.slug)
        .sort(),
    )
  })

  it('bringt keine fernen Staedte ins Spiel — die Umkreis-Grenze gilt weiter', () => {
    const verstoesse: string[] = []
    for (const s of STAEDTE) {
      for (const n of naechsteStaedte(s.slug)) {
        const km = distanzKm(s, n)
        if (km > NACHBAR_MAX_KM) verstoesse.push(`${s.slug}->${n.slug} ${km.toFixed(0)}km`)
      }
    }
    expect(verstoesse).toEqual([])
  })

  it('haelt den Block in vertretbarer Groesse', () => {
    // Reissleine gegen ein Netz, das sich unbemerkt aufblaeht.
    //
    // Gemessen am MEDIAN, nicht am Schnitt: Rueckkanten sammeln sich
    // systematisch bei den Grossstaedten (jede neue Kleinstadt waehlt die
    // naechste grosse und liefert ihr eine Rueckkante). Schnitt und Maximum
    // wachsen deshalb mit JEDER Welle — Welle 7 hob den Schnitt von 8,1 auf
    // 9,1 und Duesseldorf von 24 auf 37. Beides ist die Regel bei der Arbeit,
    // kein Fehler; eine Grenze darauf misst nur, wie viele Staedte man zuletzt
    // aufgenommen hat, und wird bei jeder Welle hochgesetzt, bis sie nichts
    // mehr aussagt.
    //
    // Der Median bleibt stabil, solange sich die Rueckkanten dort sammeln, wo
    // sie hingehoeren. Steigt er, verteilt die Auswahlregel breitflaechig zu
    // viel — genau der Fall, den diese Reissleine fangen soll.
    const groessen = STAEDTE.map((s) => naechsteStaedte(s.slug).length)
    const sortiert = [...groessen].sort((a, b) => a - b)
    expect(Math.min(...groessen)).toBe(6)
    expect(sortiert[Math.floor(sortiert.length / 2)]).toBeLessThanOrEqual(8)
  })

  it('sammelt die grossen Bloecke ausschliesslich bei Grossstaedten', () => {
    // Die inhaltliche Fassung der alten Obergrenze: nicht WIE VIELE Nachbarn
    // eine Seite haben darf, sondern WER viele haben darf. Ein langer Block
    // auf Duesseldorf ist das Hub-Spoke-Muster (die starke Seite verlinkt die
    // schwachen). Derselbe Block auf Bocholt waere ein Rechenfehler — und
    // genau den faengt eine nackte Zahl nicht, solange sie hoch genug steht.
    const auffaellig = STAEDTE.map((s) => ({ slug: s.slug, n: naechsteStaedte(s.slug).length, ew: einwohnerZahl(s.bevoelkerung) }))
      .filter((x) => x.n > 15 && x.ew < GROSSSTADT_AB_EINWOHNER)
    expect(auffaellig.map((x) => `${x.slug}: ${x.n} Nachbarn bei ${x.ew} Einw.`)).toEqual([])
  })

  it('sortiert auch die Rueckkanten nach Distanz ein', () => {
    for (const s of STAEDTE.slice(0, 20)) {
      const km = naechsteStaedte(s.slug).map((n) => distanzKm(s, n))
      expect(km).toEqual([...km].sort((a, b) => a - b))
    }
  })

  it('bleibt ohne Rueckkanten identisch zur reinen Auswahl', () => {
    const einsam = [
      { slug: 'basis', lat: 50, lng: 10, bevoelkerung: '100 Tsd.' },
      { slug: 'nah-a', lat: 50.1, lng: 10, bevoelkerung: '20 Tsd.' },
      { slug: 'nah-b', lat: 50.2, lng: 10, bevoelkerung: '20 Tsd.' },
    ]
    // nah-a und nah-b waehlen basis ebenfalls -> Rueckkanten sind hier gleich.
    expect(nachbarnMitRueckkanten('basis', einsam, 2).map((s) => s.slug)).toEqual(['nah-a', 'nah-b'])
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
  // importieren kann. Laufen beide auseinander, kennt der KI-Prompt eine andere
  // Geografie als die Seite. Dieser Test ist die einzige Klammer, die das verhindert.
  //
  // Verglichen wird gegen `naechsteAus` (die reine Distanzauswahl), NICHT gegen
  // `naechsteStaedte`: der Snapshot liefert dem Generierungs-Prompt die
  // naechstgelegenen Orte als Ortskenntnis — die Rueckkanten der Seite sind ein
  // LINKNETZ-Mittel und im Prompt nur Rauschen. Gemeinsame Distanzbasis, zwei Zwecke.
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
        lib: naechsteAus(eintrag.slug, STAEDTE, 6).map((s) => s.name),
      }))
      .filter((x) => x.snapshot.join('|') !== x.lib.join('|'))

    expect(abweichungen).toEqual([])
  })
})
