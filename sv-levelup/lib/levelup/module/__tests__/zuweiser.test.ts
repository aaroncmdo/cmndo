import { describe, expect, it } from 'vitest'
import { PlacesFehler, type Betrieb, type PlacesAdapter } from '../../../places'
import type { Messkontext } from '../../modul-vertrag'
import { ZUWEISER_PUNKTE, messeZuweiser } from '../zuweiser'

function betrieb(name: string, id: string): Betrieb {
  return { placeId: id, name, adresse: null, lat: 51.9, lng: 7.6, website: null, bewertung: 4, bewertungen: 5 }
}

function adapter(treffer: Betrieb[]): PlacesAdapter {
  return {
    suchText: async () => treffer,
    suchUmkreis: async () => treffer,
    details: async () => null,
    profil: async () => null,
    websiteVon: async () => null,
  }
}

function kontext(html: string | null, places: PlacesAdapter = adapter([betrieb('W1', 'a'), betrieb('W2', 'b')])): Messkontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48143' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places,
    jetzt: () => '2026-08-19T10:00:00.000Z',
  } as unknown as Messkontext
}

const GUT = `<html><body>
  <h1>Sachverständigenbüro Meyer</h1>
  <p>${'Wir begutachten Unfallschäden im Münsterland. '.repeat(25)}</p>
  <h2>Für Werkstätten und Karosseriebaubetriebe</h2>
  <p>Wir arbeiten mit Werkstätten in der Region zusammen und übernehmen die Begutachtung direkt vor Ort.</p>
  <h2>Für Rechtsanwälte</h2>
  <p>Kanzleien schätzen unsere gerichtsfesten Gutachten. Rechtsanwalt und Sachverständiger arbeiten Hand in Hand.</p>
  <a href="/partner">Partner werden — unsere Kooperation im Überblick</a>
  </body></html>`

describe('messeZuweiser', () => {
  it('vergibt die volle Punktzahl fuer eine Seite, die Zuweiser anspricht', async () => {
    const e = await messeZuweiser(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(ZUWEISER_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeZuweiser(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(ZUWEISER_PUNKTE)
  })

  it('wertet das Marktbild NICHT mit Punkten', async () => {
    const e = await messeZuweiser(kontext(GUT))
    const markt = e.befunde.find((b) => b.schluessel === 'potenzial')!
    // Wie viele Werkstaetten es im Umkreis gibt, ist keine Leistung des
    // Sachverstaendigen — es gehoert in den Befund, nicht in die Wertung.
    expect(markt.maximum).toBe(0)
  })

  it('erkennt eine Seite ohne Zuweiser-Ansprache', async () => {
    const ohne = `<html><body><h1>Meyer</h1><p>${'Gutachten für Privatkunden nach einem Unfall. '.repeat(30)}</p></body></html>`
    const e = await messeZuweiser(kontext(ohne))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)
    expect(e.befunde.find((b) => b.schluessel === 'werkstatt')!.wert).toBe(false)
  })

  it('misst die Website weiter, wenn die Kartensuche ausfaellt', async () => {
    const kaputt: PlacesAdapter = {
      suchText: async () => { throw new PlacesFehler('REQUEST_DENIED') },
      suchUmkreis: async () => { throw new PlacesFehler('REQUEST_DENIED') },
      details: async () => null,
      profil: async () => null,
    websiteVon: async () => null,
    }
    const e = await messeZuweiser(kontext(GUT, kaputt))
    // Das Marktbild fehlt — die drei Wertungen brauchen nur die Website.
    expect(e.befunde.find((b) => b.schluessel === 'potenzial')!.wert).toBeNull()
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(ZUWEISER_PUNKTE)
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><body><div id="root"></div>' + '<script src="/b.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeZuweiser(kontext(spa))
    for (const s of ['werkstatt', 'anwalt', 'partnerseite'] as const) {
      const b = e.befunde.find((x) => x.schluessel === s)!
      expect(b.wert).toBeNull()
      expect(b.grund).toBeTruthy()
    }
  })

  it('meldet eine Fehlstelle, wenn keine Website hinterlegt ist', async () => {
    const e = await messeZuweiser(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeZuweiser(kontext(GUT))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
