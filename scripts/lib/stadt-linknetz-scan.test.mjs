import { describe, expect, it } from 'vitest'
import { analysiereLinknetz } from './stadt-linknetz-scan.mjs'

/** Kurzschreibweise fuer eine Kante. */
const k = (von, nach, quelle = 'nachbar') => ({ von, nach, quelle })

describe('analysiereLinknetz — tote Links', () => {
  it('meldet eine Kante auf einen Slug ohne Seite', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bocholt')],
    })
    expect(r.toteLinks).toEqual([{ von: 'koeln', nach: 'bocholt', quelle: 'nachbar' }])
  })

  it('meldet einen toten Link NICHT zusaetzlich als einseitige Kante', () => {
    // Sonst erschiene derselbe Fehler zweimal und die Zahlen waeren aufgeblaeht.
    const r = analysiereLinknetz({
      slugs: ['koeln'],
      kanten: [k('koeln', 'bocholt')],
    })
    expect(r.toteLinks).toHaveLength(1)
    expect(r.einseitig).toEqual([])
  })

  it('ist still, wenn alle Ziele existieren', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn'), k('bonn', 'koeln')],
    })
    expect(r.toteLinks).toEqual([])
  })
})

describe('analysiereLinknetz — Waisen', () => {
  it('meldet eine Stadt ohne jede eingehende Kante', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn', 'einsam'],
      kanten: [k('koeln', 'bonn'), k('bonn', 'koeln')],
    })
    expect(r.waisen).toEqual(['einsam'])
  })

  it('rettet eine Stadt NICHT durch eine rein globale Quelle', () => {
    // Der Footer verlinkt von JEDER Seite auf dieselben Staedte. Zaehlte er mit,
    // waere keine Stadt je eine Waise und die Metrik saegte sich selbst ab.
    const r = analysiereLinknetz({
      slugs: ['koeln', 'nurImFooter'],
      kanten: [k('koeln', 'nurImFooter', 'footer')],
    })
    // Beide: koeln hat gar keine eingehende Kante, nurImFooter nur die globale.
    expect(r.waisen).toEqual(['koeln', 'nurImFooter'])
  })

  it('zaehlt eine thematische Kante als Rettung', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn', 'nachbar')],
    })
    expect(r.waisen).toEqual(['koeln'])
  })
})

describe('analysiereLinknetz — einseitige Kanten', () => {
  it('meldet A->B ohne B->A', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'duesseldorf'],
      kanten: [k('koeln', 'duesseldorf')],
    })
    expect(r.einseitig).toEqual([{ von: 'koeln', nach: 'duesseldorf' }])
  })

  it('meldet eine reziproke Kante nicht', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn'), k('bonn', 'koeln')],
    })
    expect(r.einseitig).toEqual([])
  })

  it('betrachtet nur thematische Kanten, nicht den globalen Strip', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn', 'footer')],
    })
    expect(r.einseitig).toEqual([])
  })

  it('sortiert die Meldungen stabil', () => {
    const r = analysiereLinknetz({
      slugs: ['a', 'b', 'c'],
      kanten: [k('c', 'a'), k('a', 'b'), k('b', 'c')],
    })
    expect(r.einseitig).toEqual([
      { von: 'a', nach: 'b' },
      { von: 'b', nach: 'c' },
      { von: 'c', nach: 'a' },
    ])
  })
})

describe('analysiereLinknetz — Kennzahlen', () => {
  it('zaehlt eine doppelt gelieferte Kante nur einmal', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn', 'nachbar'), k('koeln', 'bonn', 'nachbar')],
    })
    expect(r.kennzahl.thematischeKanten).toBe(1)
  })

  it('zaehlt dieselbe Kante aus zwei Quellen getrennt, aber thematisch einmal', () => {
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'bonn', 'nachbar'), k('koeln', 'bonn', 'footer')],
    })
    expect(r.kennzahl.thematischeKanten).toBe(1)
    expect(r.kennzahl.jeQuelle).toEqual({ nachbar: 1, footer: 1 })
  })

  it('rechnet den Schnitt ueber ALLE Staedte, auch die mit null eingehenden', () => {
    const r = analysiereLinknetz({
      slugs: ['a', 'b', 'c', 'd'],
      kanten: [k('a', 'b'), k('c', 'b')],
    })
    // 2 eingehende Kanten auf 4 Staedte
    expect(r.kennzahl.eingehendSchnitt).toBeCloseTo(0.5, 5)
    expect(r.kennzahl.eingehendMax).toBe(2)
    expect(r.kennzahl.eingehendMin).toBe(0)
  })

  it('meldet Staedte unter der Mindestzahl eingehender Links', () => {
    const r = analysiereLinknetz({
      slugs: ['a', 'b'],
      kanten: [k('a', 'b')],
      minEingehend: 1,
    })
    expect(r.schwach).toEqual([{ slug: 'a', eingehend: 0 }])
  })
})

describe('analysiereLinknetz — Randfaelle', () => {
  it('kommt mit leerer Eingabe klar', () => {
    const r = analysiereLinknetz({ slugs: [], kanten: [] })
    expect(r.waisen).toEqual([])
    expect(r.toteLinks).toEqual([])
    expect(r.einseitig).toEqual([])
    expect(r.kennzahl.eingehendSchnitt).toBe(0)
  })

  it('ignoriert eine Selbstkante', () => {
    // Eine Stadt, die sich selbst verlinkt, ist kein Netz-Beitrag.
    const r = analysiereLinknetz({
      slugs: ['koeln', 'bonn'],
      kanten: [k('koeln', 'koeln'), k('bonn', 'koeln')],
    })
    expect(r.kennzahl.thematischeKanten).toBe(1)
    expect(r.einseitig).toEqual([{ von: 'bonn', nach: 'koeln' }])
  })

  it('ignoriert eine Kante von einer Nicht-Stadtseite als Reziprozitaets-Kandidat', () => {
    // /ratgeber verlinkt Staedte, kann aber selbst kein Ziel sein — sonst waere
    // jeder Ratgeber-Link eine "einseitige Kante".
    const r = analysiereLinknetz({
      slugs: ['koeln'],
      kanten: [{ von: 'ratgeber', nach: 'koeln', quelle: 'ratgeber', vonIstStadt: false }],
    })
    expect(r.einseitig).toEqual([])
    expect(r.waisen).toEqual([])
  })
})
