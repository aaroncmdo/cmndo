import { describe, expect, it } from 'vitest'
import { mapLokalinhalt } from './lokalinhalt'

const vollstaendig = {
  stadt_slug: 'bocholt',
  status: 'veroeffentlicht',
  stadtbezirke: [{ name: 'Innenstadt', ortsteile: ['Altstadt', 'Ostwall'] }],
  hauptachsen: { autobahnen: ['A31'], bundesstrassen: ['B67'], knoten: ['Kreuz Bocholt'] },
  unfall_hotspots: [
    {
      ort: 'Nordring / Dinxperloer Straße',
      beschreibung: '2024 zwölf Unfälle mit Personenschaden.',
      quelle: 'https://www.unfallatlas.statistikportal.de/',
    },
  ],
  lokale_faqs: [{ frage: 'Wie lange dauert das?', antwort: 'Meist 24 Stunden.' }],
  hero_anker: 'Zwischen A31 und niederländischer Grenze.',
  topografie_anker: null,
  veroeffentlicht_am: '2026-08-16T12:00:00Z',
  ai_generated: true,
}

describe('mapLokalinhalt', () => {
  it('uebersetzt eine vollstaendige Zeile in die Marketing-Form', () => {
    const l = mapLokalinhalt(vollstaendig)
    expect(l).not.toBeNull()
    expect(l!.stadtbezirke).toEqual([{ name: 'Innenstadt', ortsteile: ['Altstadt', 'Ostwall'] }])
    expect(l!.hauptachsen).toEqual({
      autobahnen: ['A31'],
      bundesstrassen: ['B67'],
      knoten: ['Kreuz Bocholt'],
    })
    expect(l!.unfallHotspots).toHaveLength(1)
    expect(l!.lokaleFaqs).toHaveLength(1)
    expect(l!.heroAnker).toBe('Zwischen A31 und niederländischer Grenze.')
    expect(l!.topografieAnker).toBeUndefined()
    expect(l!.aiGenerated).toBe(true)
  })

  it('liefert null, wenn die Zeile gar keinen Inhalt traegt', () => {
    // Sonst rendert die Seite eine leere Ueberschrift ueber nichts.
    expect(
      mapLokalinhalt({
        ...vollstaendig,
        stadtbezirke: [],
        hauptachsen: { autobahnen: [], bundesstrassen: [], knoten: [] },
        unfall_hotspots: [],
        lokale_faqs: [],
        hero_anker: null,
        topografie_anker: null,
      }),
    ).toBeNull()
  })

  it('liefert null fuer null/undefined', () => {
    expect(mapLokalinhalt(null)).toBeNull()
    expect(mapLokalinhalt(undefined)).toBeNull()
  })
})

describe('mapLokalinhalt – Quellenzwang gilt AUCH beim Lesen', () => {
  // Das Gate filtert beim Schreiben. Ein direkter DB-Write (Migration, Mensch,
  // kuenftige Action) kaeme daran vorbei. Der Read ist die letzte Instanz vor
  // der Veroeffentlichung — ein Hotspot ohne belegbare Quelle wird hier erneut
  // verworfen, sonst waere der Quellenzwang eine Vereinbarung ohne Durchsetzung.
  const mitHotspots = (hotspots: unknown[]) =>
    mapLokalinhalt({ ...vollstaendig, unfall_hotspots: hotspots })

  it('verwirft einen Hotspot ohne Quelle', () => {
    const l = mitHotspots([{ ort: 'Irgendwo', beschreibung: 'Viele Unfaelle.' }])
    expect(l!.unfallHotspots).toEqual([])
  })

  it('verwirft eine Quelle, die keine abrufbare URL ist', () => {
    const l = mitHotspots([
      { ort: 'A', beschreibung: 'x', quelle: 'Polizei Bocholt' },
      { ort: 'B', beschreibung: 'x', quelle: '/intern/bericht.pdf' },
      { ort: 'C', beschreibung: 'x', quelle: 'http://localhost:3000/x' },
      { ort: 'D', beschreibung: 'x', quelle: 'https://example.com/x' },
    ])
    expect(l!.unfallHotspots).toEqual([])
  })

  it('behaelt den Hotspot mit echter Quell-URL', () => {
    const l = mitHotspots([
      { ort: 'Gut', beschreibung: 'x', quelle: 'https://www.unfallatlas.statistikportal.de/' },
      { ort: 'Schlecht', beschreibung: 'x', quelle: '' },
    ])
    expect(l!.unfallHotspots.map((h) => h.ort)).toEqual(['Gut'])
  })

  it('liefert null, wenn NUR quellenlose Hotspots die Substanz waren', () => {
    const l = mapLokalinhalt({
      ...vollstaendig,
      stadtbezirke: [],
      hauptachsen: { autobahnen: [], bundesstrassen: [], knoten: [] },
      lokale_faqs: [],
      hero_anker: null,
      topografie_anker: null,
      unfall_hotspots: [{ ort: 'Ohne', beschreibung: 'x' }],
    })
    expect(l).toBeNull()
  })
})

describe('mapLokalinhalt – kaputte Daten brechen die Seite nicht', () => {
  it('vertraegt fehlende jsonb-Felder', () => {
    const l = mapLokalinhalt({
      stadt_slug: 'x',
      status: 'veroeffentlicht',
      hero_anker: 'Nur ein Anker.',
    })
    expect(l!.stadtbezirke).toEqual([])
    expect(l!.hauptachsen).toEqual({ autobahnen: [], bundesstrassen: [], knoten: [] })
    expect(l!.unfallHotspots).toEqual([])
    expect(l!.lokaleFaqs).toEqual([])
  })

  it('vertraegt falsche Typen in den jsonb-Feldern', () => {
    const l = mapLokalinhalt({
      ...vollstaendig,
      stadtbezirke: 'kein array',
      hauptachsen: 42,
      unfall_hotspots: { kein: 'array' },
      lokale_faqs: null,
    })
    expect(l!.stadtbezirke).toEqual([])
    expect(l!.hauptachsen).toEqual({ autobahnen: [], bundesstrassen: [], knoten: [] })
    expect(l!.unfallHotspots).toEqual([])
    expect(l!.lokaleFaqs).toEqual([])
    expect(l!.heroAnker).toBe(vollstaendig.hero_anker)
  })

  it('wirft unvollstaendige Eintraege raus statt sie halb zu rendern', () => {
    const l = mapLokalinhalt({
      ...vollstaendig,
      stadtbezirke: [{ name: 'Gut', ortsteile: ['a'] }, { ortsteile: ['b'] }, { name: '' }],
      lokale_faqs: [{ frage: 'F', antwort: 'A' }, { frage: 'Ohne Antwort' }],
    })
    expect(l!.stadtbezirke.map((b) => b.name)).toEqual(['Gut'])
    expect(l!.lokaleFaqs.map((f) => f.frage)).toEqual(['F'])
  })
})
