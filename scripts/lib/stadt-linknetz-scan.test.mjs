import { describe, expect, it } from 'vitest'
import { analysiereLinknetz, teileAmSeitenFooter } from './stadt-linknetz-scan.mjs'

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

describe('teileAmSeitenFooter', () => {
  /** Der echte Site-Footer traegt immer die zehn Footer-Standorte. */
  const siteFooter = (...slugs) =>
    `<footer class="bg-claimondo-navy">${slugs.map((s) => `<a href="/kfz-gutachter/${s}">x</a>`).join('')}</footer>`
  const STANDORTE = ['koeln', 'duesseldorf', 'dortmund']

  it('trennt eine Seite mit genau einem Footer', () => {
    const html = `<main><a href="/kfz-gutachter/bonn">B</a></main>${siteFooter(...STANDORTE)}`
    const r = teileAmSeitenFooter(html, STANDORTE)
    expect(r.inhalt).toContain('/kfz-gutachter/bonn')
    expect(r.inhalt).not.toContain('/kfz-gutachter/dortmund')
    expect(r.footer).toContain('/kfz-gutachter/dortmund')
    expect(r.unsicher).toBe(null)
  })

  it('trennt am LETZTEN Footer, nicht am ersten', () => {
    // Der reale Fall: /kfz-gutachter/online-kfz-gutachten fuehrt ein
    // <blockquote> mit <footer> als Quellenangabe ("— sinngemaesse Kernaussage
    // des LG Bremen"). Das ist korrektes HTML und wird sich wiederholen, sobald
    // eine Seite ein Urteil zitiert. Wer am ERSTEN Footer abschneidet, verliert
    // den gesamten Seiteninhalt dahinter — auf jener Seite genau die acht
    // Stadt-Verweise, die dort gemessen werden sollen.
    const html =
      '<article><blockquote>Zitat<footer>— LG Bremen</footer></blockquote>' +
      '<a href="/kfz-gutachter/bonn">B</a></article>' +
      siteFooter(...STANDORTE)
    const r = teileAmSeitenFooter(html, STANDORTE)
    expect(r.inhalt).toContain('/kfz-gutachter/bonn')
    expect(r.footer).toContain('/kfz-gutachter/koeln')
    expect(r.unsicher).toBe(null)
  })

  it('meldet eine Seite ohne Footer als unsicher', () => {
    const r = teileAmSeitenFooter('<main>nichts</main>', STANDORTE)
    expect(r.footer).toBe('')
    expect(r.unsicher).toMatch(/kein <footer>/)
  })

  it('meldet als unsicher, wenn hinter dem Schnitt die Standorte fehlen', () => {
    // Die Reissleine gegen die Umkehrung des Fehlers oben: stuende der echte
    // Site-Footer VOR einem weiteren <footer>, schnitte lastIndexOf zu spaet ab
    // und die zehn globalen Standorte liefen als thematische Kanten mit. Dann
    // haette jede Stadt zehn Links geschenkt und die Waisen-Zahl waere wertlos.
    const html = `<main>x</main>${siteFooter(...STANDORTE)}<footer>Nachwort</footer>`
    const r = teileAmSeitenFooter(html, STANDORTE)
    expect(r.unsicher).toMatch(/Footer-Standorte/)
  })

  it('braucht keine Standort-Liste, um zu funktionieren', () => {
    // Ohne erwartete Standorte entfaellt nur die Reissleine, nicht der Schnitt.
    const html = `<main>x</main>${siteFooter('koeln')}`
    expect(teileAmSeitenFooter(html, []).unsicher).toBe(null)
  })
})
