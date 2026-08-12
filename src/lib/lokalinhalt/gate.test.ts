import { describe, expect, it } from 'vitest'

import {
  MIN_SUBSTANZ_SCORE,
  istBelastbareQuelle,
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
    e.lokaleFaqs = [{ frage: 'Herne?', antwort: '' }, { frage: 'Wo in Herne?', antwort: 'Hier.' }]

    const b = pruefeLokalinhalt(e, 'Herne')
    expect(b.bereinigt.stadtbezirke).toHaveLength(1)
    expect(b.bereinigt.lokaleFaqs).toHaveLength(1)
  })
})
