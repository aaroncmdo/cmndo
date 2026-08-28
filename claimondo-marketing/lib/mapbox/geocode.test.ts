import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// geocodeAdresse liest den Token beim MODUL-Import — deshalb erst setzen, dann importieren.
process.env.MAPBOX_TOKEN = 'test-token'

const { geocodeAdresse } = await import('./geocode')

// Live-Antwort fuer "Domkloster 4, 50667 Köln" (28.08.2026, 1:1 aus der API).
// Beachte die Reihenfolge: locality ("Altstadt") steht VOR place ("Köln").
const ANTWORT = {
  features: [
    {
      id: 'address.8130535781982606',
      text: 'Domkloster',
      address: '4',
      place_name: 'Domkloster 4, 50667 Köln, Deutschland',
      center: [6.9572, 50.941306],
      context: [
        { id: 'postcode.28610106', text: '50667' },
        { id: 'locality.8776250', text: 'Altstadt' },
        { id: 'place.41748538', text: 'Köln' },
        { id: 'region.42042', text: 'Nordrhein-Westfalen' },
        { id: 'country.8762', text: 'Deutschland' },
      ],
    },
  ],
}

let letzteUrl = ''
beforeEach(() => {
  letzteUrl = ''
  vi.stubGlobal('fetch', async (url: string) => {
    letzteUrl = String(url)
    return { ok: true, json: async () => ANTWORT } as Response
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('geocodeAdresse — PLZ und Ort kommen mit', () => {
  it('liefert PLZ und STADT (nicht den Stadtteil)', async () => {
    const g = await geocodeAdresse('Domkloster 4, 50667 Köln')
    // Vorher: beide Felder gab es gar nicht — leads.unfallort_plz blieb leer, und damit
    // auch claims.schadenort_plz (convertLeadToClaim liest genau diese Spalte).
    expect(g?.plz).toBe('50667')
    expect(g?.ort).toBe('Köln')
    expect(g?.ort).not.toBe('Altstadt')
  })

  it('liefert weiterhin Koordinaten und die formatierte Adresse', async () => {
    const g = await geocodeAdresse('Domkloster 4, 50667 Köln')
    expect(g?.lat).toBeCloseTo(50.941306, 4)
    expect(g?.lng).toBeCloseTo(6.9572, 4)
    expect(g?.formatted).toBe('Domkloster 4, 50667 Köln, Deutschland')
    expect(g?.placeId).toBe('address.8130535781982606')
  })

  it('fragt auf DEUTSCH an — sonst kommt "Germany" statt "Deutschland" zurueck', async () => {
    await geocodeAdresse('Domkloster 4, 50667 Köln')
    expect(letzteUrl).toContain('language=de')
    expect(letzteUrl).toContain('country=de')
  })

  it('zu kurze Eingabe -> null, ohne Anfrage', async () => {
    expect(await geocodeAdresse('ab')).toBeNull()
    expect(letzteUrl).toBe('')
  })

  it('leere Trefferliste -> null (Caller faellt auf "kein SV-Match" zurueck)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ features: [] }) }) as Response)
    expect(await geocodeAdresse('Nirgendwostraße 1')).toBeNull()
  })

  it('HTTP-Fehler -> null, kein Wurf', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }) as Response)
    expect(await geocodeAdresse('Domkloster 4, Köln')).toBeNull()
  })
})
