import { describe, it, expect } from 'vitest'
import { mapboxFeatureZuVorschlag } from './adress-vorschlaege'

// Regressions-Guard fuer den Ortsverlust vom 28.08.2026.
//
// Der Fehler: `ausKontext` behandelte `place` (Stadt) und `locality` (Stadtteil) als
// gleichwertig — "wer zuerst im context-Array steht, gewinnt". Mapbox listet den
// Stadtteil zuerst, also wurde aus Köln "Altstadt". Der Mini-Wizard schrieb das in sein
// Adressfeld, der Server geocodierte den Rest ohne Kontext neu und traf
// Düsseldorf-Altstadt (51.22/6.77 statt 50.94/6.96) — 40 km daneben. Der Fall ging an
// einen Düsseldorfer Gutachter, die Werkstattliste zeigte Ratingen.
//
// Die Fixtures sind KEINE erfundenen Beispiele: sie stammen 1:1 aus der Live-Antwort
// der Mapbox-Geocoding-API vom 28.08.2026 (dieselbe Anfrage, die der Finder stellt).

/** Live-Antwort fuer "Domkloster 4, 50667 Köln" — beachte: locality VOR place. */
const KOELN_ADRESSE = {
  id: 'address.8130535781982606',
  text: 'Domkloster',
  address: '4',
  place_name: 'Domkloster 4, 50667 Köln, Deutschland',
  center: [6.9572, 50.941306] as [number, number],
  context: [
    { id: 'postcode.28610106', text: '50667' },
    { id: 'locality.8776250', text: 'Altstadt' },
    { id: 'place.41748538', text: 'Köln' },
    { id: 'region.42042', text: 'Nordrhein-Westfalen' },
    { id: 'country.8762', text: 'Deutschland' },
  ],
}

/** Live-Antwort fuer die reine PLZ — gleiche Reihenfolge, kein address-Praefix. */
const KOELN_PLZ = {
  id: 'postcode.28610106',
  text: '50667',
  place_name: '50667, Köln, Nordrhein-Westfalen, Deutschland',
  center: [6.96042, 50.938023] as [number, number],
  context: [
    { id: 'locality.8776250', text: 'Altstadt' },
    { id: 'place.41748538', text: 'Köln' },
    { id: 'region.42042', text: 'Nordrhein-Westfalen' },
    { id: 'country.8762', text: 'Deutschland' },
  ],
}

describe('mapboxFeatureZuVorschlag — Stadt vs. Stadtteil', () => {
  it('nimmt die STADT (place), nicht den Stadtteil (locality) — auch wenn der zuerst steht', () => {
    const v = mapboxFeatureZuVorschlag(KOELN_ADRESSE)
    expect(v?.stadt).toBe('Köln')
    expect(v?.stadt).not.toBe('Altstadt')
  })

  it('liefert die vollstaendige Adresse samt Hausnummer und PLZ', () => {
    const v = mapboxFeatureZuVorschlag(KOELN_ADRESSE)
    expect(v?.adresse).toBe('Domkloster 4, 50667 Köln, Deutschland')
    expect(v?.strasse).toBe('Domkloster 4')
    expect(v?.plz).toBe('50667')
  })

  it('liefert Kölner Koordinaten (nicht die von Düsseldorf-Altstadt)', () => {
    const v = mapboxFeatureZuVorschlag(KOELN_ADRESSE)
    expect(v?.lat).toBeCloseTo(50.941306, 4)
    expect(v?.lng).toBeCloseTo(6.9572, 4)
    // Duesseldorf-Altstadt liegt bei 51.2251/6.7724 — das war das falsche Ergebnis.
    expect(v!.lat).toBeLessThan(51.0)
  })

  it('auch beim PLZ-Treffer gewinnt die Stadt', () => {
    expect(mapboxFeatureZuVorschlag(KOELN_PLZ)?.stadt).toBe('Köln')
  })

  it('faellt auf locality zurueck, wenn es gar kein place gibt', () => {
    const nurLocality = {
      id: 'address.1',
      text: 'Hauptstr',
      address: '1',
      place_name: 'Hauptstr 1, Kleinort, Deutschland',
      center: [7, 51] as [number, number],
      context: [{ id: 'locality.9', text: 'Kleinort' }, { id: 'country.8762', text: 'Deutschland' }],
    }
    expect(mapboxFeatureZuVorschlag(nurLocality)?.stadt).toBe('Kleinort')
  })

  it('setzt strasse nur bei echten Adressen, nicht bei Ort-Treffern', () => {
    expect(mapboxFeatureZuVorschlag(KOELN_PLZ)?.strasse).toBe('')
    // Ein Ort-Treffer traegt seinen Namen in `text` -> stadt, nicht strasse.
    const ort = { id: 'place.41748538', text: 'Köln', place_name: 'Köln, Deutschland', center: [6.96, 50.94] as [number, number], context: [] }
    const v = mapboxFeatureZuVorschlag(ort)
    expect(v?.strasse).toBe('')
    expect(v?.stadt).toBe('Köln')
  })

  it('ohne center kein Vorschlag (Koordinaten sind der Zweck)', () => {
    expect(mapboxFeatureZuVorschlag({ id: 'x', text: 'Ohne' })).toBeNull()
  })
})
