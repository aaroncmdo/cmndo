import { describe, expect, it } from 'vitest'
import { PlacesFehler, type Betrieb, type PlacesAdapter, type Profil } from '../../../places'
import type { Messkontext } from '../../modul-vertrag'
import { GBP_PUNKTE, messeGbp } from '../gbp'

const STANDORT = { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48143' }

function betrieb(name: string, id: string, bewertungen = 10, bewertung: number | null = 5): Betrieb {
  return { placeId: id, name, adresse: null, lat: 51.9, lng: 7.6, website: null, bewertung, bewertungen }
}

function adapter(treffer: Betrieb[], profil: Profil | null): PlacesAdapter {
  return {
    suchText: async () => treffer,
    suchUmkreis: async () => treffer,
    details: async () => null,
    profil: async () => profil,
  }
}

type Kontext = Messkontext & { firmenname?: string | null }

function kontext(over: Partial<Kontext>): Kontext {
  return {
    modus: 'bestand',
    websiteUrl: null,
    standort: STANDORT,
    hole: async () => ({ ok: false, status: 0, dauerMs: 0 }),
    places: adapter([], null),
    jetzt: () => '2026-08-19T10:00:00.000Z',
    ...over,
  } as Kontext
}

const VOLL: Profil = {
  placeId: 'p1', name: 'Sachverständigenbüro Meyer', adresse: 'Weg 1', lat: 51.9, lng: 7.6,
  website: 'https://meyer.de', bewertung: 4.9, bewertungen: 42,
  fotos: 10, oeffnungszeiten: true, telefon: '0251 123', betriebsstatus: 'OPERATIONAL',
}

const EIGENER = betrieb('Sachverständigenbüro Meyer', 'p1', 42)

describe('messeGbp', () => {
  it('vergibt die volle Punktzahl fuer ein vollstaendiges Profil', async () => {
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([EIGENER], VOLL),
    }))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(GBP_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([EIGENER], VOLL),
    }))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(GBP_PUNKTE)
  })

  it('zieht Punkte ab, wo das Profil leer ist — und nennt es einen Messwert', async () => {
    const leer: Profil = {
      ...VOLL, fotos: 0, oeffnungszeiten: false, bewertungen: 0,
      bewertung: null, telefon: null, website: null,
    }
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([betrieb('Sachverständigenbüro Meyer', 'p1', 0, null)], leer),
    }))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)

    // ⚠ 0 Fotos ist ein MESSWERT (wert 0), keine Fehlstelle (wert null).
    const fotos = e.befunde.find((b) => b.schluessel === 'fotos')!
    expect(fotos.wert).toBe(0)
    expect(fotos.grund).toBeUndefined()

    // Ohne Bewertungen gibt es keinen Durchschnitt — DAS ist nicht erhoben.
    const schnitt = e.befunde.find((b) => b.schluessel === 'bewertungsschnitt')!
    expect(schnitt.wert).toBeNull()
    expect(schnitt.grund).toBeTruthy()
  })

  it('meldet eine Fehlstelle statt Nullen, wenn der Firmenname fehlt', async () => {
    const e = await messeGbp(kontext({ firmenname: null, places: adapter([betrieb('Fremd', 'p9')], VOLL) }))
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => typeof b.grund === 'string' && b.grund.length > 0)).toBe(true)
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)
  })

  it('macht aus einem gesperrten Schluessel KEIN leeres Profil', async () => {
    const kaputt: PlacesAdapter = {
      suchText: async () => { throw new PlacesFehler('REQUEST_DENIED') },
      suchUmkreis: async () => [],
      details: async () => null,
      profil: async () => null,
    }
    const e = await messeGbp(kontext({ firmenname: 'Meyer', places: kaputt }))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.fehlstellen[0].grund).toContain('REQUEST_DENIED')
    // Kein einziger Befund, der dem Betrieb etwas vorwirft.
    expect(e.befunde.filter((b) => b.wert !== null)).toHaveLength(0)
  })

  it('gibt die Fotozahl als Untergrenze aus, wenn Places deckelt', async () => {
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([EIGENER], VOLL),
    }))
    // Places liefert hoechstens 10 — „10" heisst „mindestens 10".
    expect(String(e.befunde.find((b) => b.schluessel === 'fotos')!.einordnung).toLowerCase())
      .toContain('mindestens')
  })

  it('ordnet den Bewertungsschnitt am tatsaechlichen Umkreis ein, nicht an einer festen Annahme', async () => {
    // Drei von vier Wettbewerbern haben glatte 5,0 — gemessen, nicht geraten.
    const umfeld = [
      EIGENER,
      betrieb('Fremd A', 'a', 30, 5),
      betrieb('Fremd B', 'b', 30, 5),
      betrieb('Fremd C', 'c', 30, 4.1),
    ]
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter(umfeld, VOLL),
    }))
    const schnitt = e.befunde.find((b) => b.schluessel === 'bewertungsschnitt')!
    // Die Einordnung nennt den gemessenen Anteil, damit „4,9" einordbar wird.
    expect(String(schnitt.einordnung)).toMatch(/\d+ %/)
  })

  it('vergibt fuer die Bewertungszahl mehr Gewicht als fuer den Schnitt', async () => {
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([EIGENER], VOLL),
    }))
    const zahl = e.befunde.find((b) => b.schluessel === 'bewertungszahl')!
    const schnitt = e.befunde.find((b) => b.schluessel === 'bewertungsschnitt')!
    // Ueber 91 echte Betriebe gemessen: der Schnitt trennt kaum (92 % ueber
    // 4,5), die Zahl trennt stark (3 bis 95).
    expect(zahl.maximum).toBeGreaterThan(schnitt.maximum)
  })

  it('ist im Weg aufbau nicht anwendbar', async () => {
    const e = await messeGbp(kontext({ modus: 'aufbau', firmenname: 'Meyer' }))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.befunde).toHaveLength(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeGbp(kontext({
      firmenname: 'Sachverständigenbüro Meyer',
      places: adapter([EIGENER], VOLL),
    }))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
