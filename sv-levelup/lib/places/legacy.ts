import {
  PlacesFehler,
  type AdapterOpts,
  type Betrieb,
  type PlacesAdapter,
  type Umkreis,
} from './adapter'

const BASIS = 'https://maps.googleapis.com/maps/api/place'

/** Google gibt `next_page_token` verzoegert frei — frueher gefragt: INVALID_REQUEST. */
export const PAGING_WARTE_MS = 2000
/** 3 Seiten a 20 = die 60 Treffer, die Legacy maximal liefert. */
export const MAX_SEITEN = 3

/** Nur diese beiden Zustaende sind ein Ergebnis. Alles andere ist ein Fehler. */
const OK_ZUSTAENDE = ['OK', 'ZERO_RESULTS']

type RohOrt = {
  place_id?: string
  name?: string
  formatted_address?: string
  vicinity?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  website?: string
  rating?: number
  user_ratings_total?: number
}

function zuBetrieb(o: RohOrt): Betrieb | null {
  const lat = o.geometry?.location?.lat
  const lng = o.geometry?.location?.lng
  if (!o.place_id || lat === undefined || lng === undefined) return null

  return {
    placeId: o.place_id,
    name: o.name ?? '',
    // Nichts erfinden: fehlt ein Feld, ist es null (R-B).
    adresse: o.formatted_address ?? o.vicinity ?? null,
    lat,
    lng,
    website: o.website ?? null,
    bewertung: o.rating ?? null,
    bewertungen: o.user_ratings_total ?? null,
  }
}

/**
 * Legacy Places API (`maps.googleapis.com`) — laeuft mit dem heutigen Key.
 *
 * Gemessen am 18.08.2026: `textsearch` und `nearbysearch` antworten, inklusive
 * `next_page_token`. Die New API gibt mit demselben Key 403.
 */
export function erzeugeLegacy(apiKey: string, opts: AdapterOpts = {}): PlacesAdapter {
  const f = opts.fetchImpl ?? fetch
  const warte = opts.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  async function hole(pfad: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const u = new URL(`${BASIS}${pfad}`)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    u.searchParams.set('key', apiKey)

    const res = await f(u.toString())
    if (!res.ok) throw new PlacesFehler(`HTTP_${res.status}`)

    const daten = (await res.json()) as Record<string, unknown>
    const status = String(daten.status ?? '')
    if (!OK_ZUSTAENDE.includes(status)) {
      throw new PlacesFehler(status, daten.error_message as string | undefined)
    }
    return daten
  }

  /** Sammelt bis zu MAX_SEITEN Seiten. */
  async function alleSeiten(pfad: string, params: Record<string, string>): Promise<Betrieb[]> {
    const betriebe: Betrieb[] = []
    let token: string | undefined

    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      if (token) await warte(PAGING_WARTE_MS)
      const daten = await hole(pfad, token ? { ...params, pagetoken: token } : params)

      for (const roh of (daten.results as RohOrt[]) ?? []) {
        const b = zuBetrieb(roh)
        if (b) betriebe.push(b)
      }

      token = daten.next_page_token as string | undefined
      if (!token) break
    }
    return betriebe
  }

  return {
    async suchText(frage, umkreis: Umkreis) {
      return alleSeiten('/textsearch/json', {
        query: frage,
        location: `${umkreis.lat},${umkreis.lng}`,
        radius: String(Math.round(umkreis.km * 1000)),
        language: 'de',
        region: 'de',
      })
    },

    async suchUmkreis(stichwort, umkreis: Umkreis) {
      // Freitext-`keyword` statt `type`: fuer Kfz-Sachverstaendige gibt es
      // keinen Places-Typ. Genau das kann die New API bei Nearby nicht.
      return alleSeiten('/nearbysearch/json', {
        keyword: stichwort,
        location: `${umkreis.lat},${umkreis.lng}`,
        radius: String(Math.round(umkreis.km * 1000)),
        language: 'de',
      })
    },

    async details(placeId) {
      try {
        const daten = await hole('/details/json', {
          place_id: placeId,
          fields: 'place_id,name,formatted_address,geometry,website,rating,user_ratings_total',
          language: 'de',
        })
        return zuBetrieb((daten.result as RohOrt) ?? {})
      } catch (err) {
        // NOT_FOUND ist eine Antwort ("den Ort gibt es nicht"), kein Fehler.
        if (err instanceof PlacesFehler && err.status === 'NOT_FOUND') return null
        throw err
      }
    },
  }
}
