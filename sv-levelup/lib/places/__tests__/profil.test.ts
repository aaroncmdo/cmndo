import { describe, expect, it } from 'vitest'
import { erzeugeLegacy } from '../legacy'

function antwort(daten: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(daten), { status: 200 })) as unknown as typeof fetch
}

const VOLL = {
  status: 'OK',
  result: {
    place_id: 'p1',
    name: 'Büro Meyer',
    formatted_address: 'Weg 1, 48143 Münster',
    geometry: { location: { lat: 51.9, lng: 7.6 } },
    website: 'https://meyer.de',
    rating: 4.8,
    user_ratings_total: 42,
    photos: [{}, {}, {}],
    opening_hours: { weekday_text: ['Montag: 09:00–17:00'] },
    formatted_phone_number: '0251 123',
    business_status: 'OPERATIONAL',
  },
}

describe('profil', () => {
  it('liest die Profilmerkmale aus der Antwort', async () => {
    const a = erzeugeLegacy('k', { fetchImpl: antwort(VOLL) })

    const p = await a.profil('p1')
    expect(p).not.toBeNull()
    expect(p!.fotos).toBe(3)
    expect(p!.oeffnungszeiten).toBe(true)
    expect(p!.telefon).toBe('0251 123')
    expect(p!.betriebsstatus).toBe('OPERATIONAL')
    expect(p!.bewertungen).toBe(42)
    expect(p!.name).toBe('Büro Meyer')
  })

  it('fordert die Profilfelder auch wirklich an', async () => {
    let gerufen = ''
    const a = erzeugeLegacy('k', {
      fetchImpl: (async (u: string) => {
        gerufen = u
        return new Response(JSON.stringify(VOLL), { status: 200 })
      }) as unknown as typeof fetch,
    })
    await a.profil('p1')
    // Ohne diese Felder in der Anfrage liefert Google sie nicht — und die
    // Abbildung saehe still wie ein ungepflegtes Profil aus.
    for (const feld of ['photos', 'opening_hours', 'formatted_phone_number', 'business_status']) {
      expect(decodeURIComponent(gerufen)).toContain(feld)
    }
  })

  it('meldet fehlende Merkmale als fehlend', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({
        status: 'OK',
        result: {
          place_id: 'p2',
          name: 'Ohne alles',
          geometry: { location: { lat: 51, lng: 7 } },
        },
      }),
    })

    const p = await a.profil('p2')
    expect(p!.fotos).toBe(0)
    expect(p!.oeffnungszeiten).toBe(false)
    expect(p!.telefon).toBeNull()
    expect(p!.betriebsstatus).toBeNull()
  })

  it('macht aus NOT_FOUND ein null, nicht einen Fehler', async () => {
    const a = erzeugeLegacy('k', { fetchImpl: antwort({ status: 'NOT_FOUND' }) })
    await expect(a.profil('weg')).resolves.toBeNull()
  })

  it('laesst einen gesperrten Schluessel als Fehler durch', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({ status: 'REQUEST_DENIED', error_message: 'gesperrt' }),
    })
    // ⚠ NIE als leeres Profil — sonst sieht ein gesperrter Schluessel aus wie
    // ein Betrieb, der sein Profil nicht pflegt, und der Befund wirft ihm
    // etwas vor, das nicht gemessen wurde.
    await expect(a.profil('p')).rejects.toThrow('REQUEST_DENIED')
  })

  it('liefert null, wenn die Antwort keine Koordinaten traegt', async () => {
    const a = erzeugeLegacy('k', {
      fetchImpl: antwort({ status: 'OK', result: { place_id: 'p3', name: 'Ohne Ort' } }),
    })
    await expect(a.profil('p3')).resolves.toBeNull()
  })
})
