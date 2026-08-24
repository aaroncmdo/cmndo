import { describe, it, expect } from 'vitest'
import { mapboxFeatureZuVorschlag } from '../adress-vorschlaege'

// Die Abbildung Mapbox-Feature -> PlaceResult ist der Teil, der STILL falsch sein
// kann: kommt PLZ oder Ort nicht an, laeuft der Lead-Insert mit leeren Spalten
// weiter, ohne dass irgendwo ein Fehler auftaucht. Genau die Klasse, die diesen
// ganzen Vorfall ausgeloest hat.

describe('mapboxFeatureZuVorschlag', () => {
  it('zieht Strasse, Hausnummer, PLZ und Ort aus einem Adress-Treffer', () => {
    const v = mapboxFeatureZuVorschlag({
      id: 'address.123',
      text: 'Bahnhofstraße',
      address: '7',
      place_name: 'Bahnhofstraße 7, 42799 Leichlingen, Deutschland',
      center: [7.014153, 51.105864],
      context: [
        { id: 'postcode.9', text: '42799' },
        { id: 'place.4', text: 'Leichlingen' },
        { id: 'country.1', text: 'Deutschland' },
      ],
    })
    expect(v).not.toBeNull()
    expect(v!.strasse).toBe('Bahnhofstraße 7')
    expect(v!.plz).toBe('42799')
    expect(v!.stadt).toBe('Leichlingen')
    // Mapbox liefert [lng, lat] — vertauscht landet der Treffer im Meer.
    expect(v!.lat).toBe(51.105864)
    expect(v!.lng).toBe(7.014153)
  })

  it('findet PLZ und Ort unabhaengig von der Reihenfolge im Kontext', () => {
    const v = mapboxFeatureZuVorschlag({
      id: 'address.1',
      text: 'Musterweg',
      address: '1',
      place_name: 'Musterweg 1, 50667 Köln',
      center: [6.96042, 50.938023],
      context: [
        { id: 'country.1', text: 'Deutschland' },
        { id: 'place.4', text: 'Köln' },
        { id: 'region.2', text: 'Nordrhein-Westfalen' },
        { id: 'postcode.9', text: '50667' },
      ],
    })
    expect(v!.plz).toBe('50667')
    expect(v!.stadt).toBe('Köln')
  })

  it('setzt bei einem reinen Ort-Treffer KEINE Strasse, sondern den Ort', () => {
    // Sonst stuende "Leichlingen" als Strassenname im Lead.
    const v = mapboxFeatureZuVorschlag({
      id: 'place.4',
      text: 'Leichlingen',
      place_name: 'Leichlingen, Nordrhein-Westfalen, Deutschland',
      center: [7.01, 51.1],
      context: [{ id: 'region.2', text: 'Nordrhein-Westfalen' }],
    })
    expect(v!.strasse).toBe('')
    expect(v!.stadt).toBe('Leichlingen')
  })

  it('nimmt den Ort aus dem Kontext, wenn beides vorhanden ist', () => {
    const v = mapboxFeatureZuVorschlag({
      id: 'locality.7',
      text: 'Witzhelden',
      place_name: 'Witzhelden, Leichlingen',
      center: [7.1, 51.1],
      context: [{ id: 'place.4', text: 'Leichlingen' }],
    })
    expect(v!.stadt).toBe('Leichlingen')
  })

  it('verwirft ein Feature ohne Koordinaten statt 0/0 zu liefern', () => {
    // 0/0 liegt im Golf von Guinea — ein SV-Matching darauf waere still falsch.
    expect(mapboxFeatureZuVorschlag({ id: 'address.1', place_name: 'X', context: [] })).toBeNull()
    expect(
      mapboxFeatureZuVorschlag({ id: 'address.1', place_name: 'X', center: [1] as unknown as [number, number] }),
    ).toBeNull()
  })

  it('kommt ohne Kontext zurecht (PLZ und Ort bleiben leer, kein Absturz)', () => {
    const v = mapboxFeatureZuVorschlag({
      id: 'address.1', text: 'Weg', address: '2', place_name: 'Weg 2', center: [7, 51],
    })
    expect(v!.plz).toBe('')
    expect(v!.strasse).toBe('Weg 2')
  })

  it('setzt place_id aus der Mapbox-Feature-ID', () => {
    const v = mapboxFeatureZuVorschlag({
      id: 'address.987', text: 'A', address: '1', place_name: 'A 1', center: [7, 51],
    })
    expect(v!.place_id).toBe('address.987')
  })
})
