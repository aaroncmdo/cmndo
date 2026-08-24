import { beforeEach, describe, expect, it } from 'vitest'
import { erzeugeLegacy } from '../legacy'
import { erzeugeNeu } from '../neu'

/**
 * Geprueft wird die ABBILDUNG auf den gemeinsamen Vertrag und die
 * Fehlerhaltung — nicht Google. Der Adapter ist die einzige Stelle, an der
 * Legacy und New sich unterscheiden duerfen.
 */
let aufrufe: string[] = []
let antworten: unknown[] = []
let index = 0

const fakeFetch = (async (url: string | URL) => {
  aufrufe.push(String(url))
  const a = antworten[Math.min(index++, antworten.length - 1)]
  return { ok: true, json: async () => a } as unknown as Response
}) as unknown as typeof fetch

const TREFFER = {
  place_id: 'P1',
  name: 'Gutachter Meyer',
  formatted_address: 'Hafenweg 3, 48143 Münster',
  geometry: { location: { lat: 51.96, lng: 7.62 } },
  website: 'https://meyer.de',
  rating: 4.8,
  user_ratings_total: 42,
}

/** Die Drossel wird mit gefaelschter Uhr uebersprungen — sonst 2 s je Seite. */
const sofort = async () => {}

beforeEach(() => {
  aufrufe = []
  antworten = [{ status: 'OK', results: [TREFFER] }]
  index = 0
})

describe('Legacy-Adapter', () => {
  it('bildet die Antwort auf den gemeinsamen Vertrag ab', async () => {
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    const r = await a.suchText('Kfz-Sachverständiger', { lat: 51.96, lng: 7.62, km: 50 })

    expect(r).toEqual([{
      placeId: 'P1', name: 'Gutachter Meyer', adresse: 'Hafenweg 3, 48143 Münster',
      lat: 51.96, lng: 7.62, website: 'https://meyer.de', bewertung: 4.8, bewertungen: 42,
    }])
  })

  it('setzt fehlende Felder auf null statt sie zu erfinden', async () => {
    antworten = [{ status: 'OK', results: [{
      place_id: 'P2', name: 'Ohne Alles', geometry: { location: { lat: 1, lng: 2 } },
    }] }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    const r = await a.suchText('x', { lat: 0, lng: 0, km: 1 })

    expect(r[0]).toMatchObject({ adresse: null, website: null, bewertung: null, bewertungen: null })
  })

  it('rechnet km in Meter um', async () => {
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await a.suchUmkreis('Autohaus', { lat: 51.96, lng: 7.62, km: 25 })
    expect(aufrufe[0]).toContain('radius=25000')
  })

  it('nutzt fuer suchUmkreis den Freitext-keyword — dafuer gibt es keinen Places-Typ', async () => {
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await a.suchUmkreis('Kfz-Sachverständiger', { lat: 1, lng: 2, km: 25 })
    expect(aufrufe[0]).toContain('nearbysearch')
    expect(aufrufe[0]).toContain('keyword=')
  })

  it('meldet ZERO_RESULTS als leere Liste, nicht als Fehler', async () => {
    antworten = [{ status: 'ZERO_RESULTS', results: [] }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).resolves.toEqual([])
  })

  /**
   * ⚠ Der wichtigste Test: Ein API-Fehler darf NIE als "keine Wettbewerber"
   * durchgehen. Das waere ein Befund, den es nicht gibt — und die Klasse
   * Fehler, die als plausible Null im Ergebnis landet (R-B).
   */
  it('wirft bei REQUEST_DENIED, statt leer zurueckzugeben', async () => {
    antworten = [{ status: 'REQUEST_DENIED', error_message: 'key blocked' }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).rejects.toThrow(/REQUEST_DENIED/)
  })

  it('wirft auch bei OVER_QUERY_LIMIT', async () => {
    antworten = [{ status: 'OVER_QUERY_LIMIT' }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).rejects.toThrow(/OVER_QUERY_LIMIT/)
  })

  it('holt weitere Seiten ueber next_page_token', async () => {
    antworten = [
      { status: 'OK', results: [{ ...TREFFER, place_id: 'A' }], next_page_token: 'TOK' },
      { status: 'OK', results: [{ ...TREFFER, place_id: 'B' }] },
    ]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    const r = await a.suchText('x', { lat: 0, lng: 0, km: 1 })

    expect(r.map((b) => b.placeId)).toEqual(['A', 'B'])
    expect(aufrufe[1]).toContain('pagetoken=TOK')
  })

  it('holt hoechstens drei Seiten', async () => {
    antworten = [{ status: 'OK', results: [TREFFER], next_page_token: 'IMMER' }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await a.suchText('x', { lat: 0, lng: 0, km: 1 })
    expect(aufrufe.length).toBe(3)
  })

  // Google gibt das Token verzoegert frei — ohne Wartezeit liefert Seite 2
  // INVALID_REQUEST, was wie "keine weiteren Treffer" aussieht.
  it('wartet vor dem Abruf der Folgeseite', async () => {
    const gewartet: number[] = []
    antworten = [
      { status: 'OK', results: [TREFFER], next_page_token: 'TOK' },
      { status: 'OK', results: [TREFFER] },
    ]
    const a = erzeugeLegacy('KEY', {
      fetchImpl: fakeFetch, warte: async (ms: number) => { gewartet.push(ms) },
    })
    await a.suchText('x', { lat: 0, lng: 0, km: 1 })
    expect(gewartet[0]).toBeGreaterThanOrEqual(2000)
  })

  it('liefert details fuer eine place_id', async () => {
    antworten = [{ status: 'OK', result: TREFFER }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    const r = await a.details('P1')

    expect(aufrufe[0]).toContain('/details/json')
    expect(r?.placeId).toBe('P1')
  })

  it('gibt details null zurueck, wenn der Ort nicht existiert', async () => {
    antworten = [{ status: 'NOT_FOUND' }]
    const a = erzeugeLegacy('KEY', { fetchImpl: fakeFetch, warte: sofort })
    await expect(a.details('weg')).resolves.toBeNull()
  })
})

describe('New-Adapter', () => {
  /**
   * Bewusst ein sprechender Fehlschlag statt eines stillen Rueckfalls auf
   * Legacy: wer auf New umschaltet, soll merken, wenn die Freischaltung fehlt.
   */
  it('sagt klar, dass A-1 fehlt', async () => {
    const a = erzeugeNeu('KEY')
    await expect(a.suchText('x', { lat: 0, lng: 0, km: 1 })).rejects.toThrow(/A-1/)
  })
})
