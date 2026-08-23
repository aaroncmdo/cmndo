import {
  PlacesFehler,
  type AdapterOpts,
  type Betrieb,
  type PlacesAdapter,
  type Profil,
  type Umkreis,
} from './adapter'

const BASIS = 'https://maps.googleapis.com/maps/api/place'

/** Google gibt `next_page_token` verzoegert frei — frueher gefragt: INVALID_REQUEST. */
export const PAGING_WARTE_MS = 2000
/** 3 Seiten a 20 = die 60 Treffer, die Legacy maximal liefert. */
export const MAX_SEITEN = 3

/** Nur diese beiden Zustaende sind ein Ergebnis. Alles andere ist ein Fehler. */
const OK_ZUSTAENDE = ['OK', 'ZERO_RESULTS']

/** Die Felder, die `Betrieb` fuellen. */
const GRUND_FELDER = 'place_id,name,formatted_address,geometry,website,rating,user_ratings_total'
/** Zusaetzlich fuer `Profil` — was `gbp` beurteilt. */
const PROFIL_FELDER = 'photos,opening_hours,formatted_phone_number,business_status'

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

type RohProfil = RohOrt & {
  photos?: unknown[]
  opening_hours?: unknown
  formatted_phone_number?: string
  business_status?: string
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
  const zaehler = opts.zaehler

  // ── Notbremse gegen den Fehlersturm ──────────────────────────────────────
  //
  // ⚠ Am 21.08. kostete genau diese Konstellation 2.798 EUR: 80 % der Abrufe
  // scheiterten am Netz, jeder wurde dreimal gefeuert, und Google berechnete
  // alle drei — die Antwort kam nie an, der Abruf schon.
  //
  // ⭐ Eine hohe Fehlerquote ist KEIN Grund, es oefter zu versuchen. Sie ist ein
  // Grund aufzuhoeren: wenn vier von fuenf Abrufen sterben, ist etwas
  // grundsaetzlich kaputt (Netz, Drossel, Sperre), und Weiterfeuern kauft nur
  // Rechnungsposten. Die alte Logik tat das Gegenteil.
  const FENSTER = 20
  const MAX_FEHLERQUOTE = 0.5
  const letzte: boolean[] = []   // true = Fehler

  function merke(fehler: boolean): void {
    letzte.push(fehler)
    if (letzte.length > FENSTER) letzte.shift()
  }

  function stuermtEs(): boolean {
    if (letzte.length < FENSTER) return false
    return letzte.filter(Boolean).length / letzte.length > MAX_FEHLERQUOTE
  }

  /**
   * Ein Abruf mit Wiederholung bei NETZ-Fehlern.
   *
   * ⚠ Am Deutschland-Lauf gemessen (20.08.): von rund 1.392 Versuchen kamen
   * nur 273 an — **1.119 Mal „fetch failed"**, eine Ausfallquote von 80 %. Der
   * Adapter feuerte ohne jede Pause und ohne zweiten Versuch, waehrend der
   * Website-Holer in `netz.ts` beides laengst hat. Der Lauf sah dabei gesund
   * aus: er lieferte 2.864 Betriebe und meldete die Fehler brav im Bericht —
   * nur waren vier Fuenftel des Landes nie abgefragt worden.
   *
   * Wiederholt wird NUR bei Netzfehlern. Ein `REQUEST_DENIED` oder
   * `OVER_QUERY_LIMIT` ist eine Antwort, keine Stoerung: sie zu wiederholen
   * verbrennt Kontingent und aendert nichts.
   */
  async function mitWiederholung(url: string): Promise<Response> {
    if (stuermtEs()) {
      throw new PlacesFehler(
        'FEHLERSTURM',
        `mehr als ${MAX_FEHLERQUOTE * 100} % der letzten ${FENSTER} Abrufe scheiterten — ` +
          `Lauf gestoppt, bevor er weiter Abrufe bezahlt, die nichts liefern`,
      )
    }

    let letzter: unknown
    for (let versuch = 0; versuch < 3; versuch++) {
      if (versuch > 0) await warte(500 * 2 ** versuch)   // 1 s, dann 2 s
      // ⚠ VOR dem Abruf melden, nicht danach. Google berechnet den Abruf, sobald
      // er ankommt — auch wenn uns die Antwort nie erreicht. Wer erst nach einer
      // erfolgreichen Antwort zaehlt, zaehlt genau die teuren Faelle nicht.
      zaehler?.melde()
      try {
        const res = await f(url)
        merke(false)
        return res
      } catch (err) {
        merke(true)
        letzter = err
      }
    }
    throw new PlacesFehler('NETZ', letzter instanceof Error ? letzter.message : String(letzter))
  }

  async function hole(pfad: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const u = new URL(`${BASIS}${pfad}`)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    u.searchParams.set('key', apiKey)

    const res = await mitWiederholung(u.toString())
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
          fields: GRUND_FELDER,
          language: 'de',
        })
        return zuBetrieb((daten.result as RohOrt) ?? {})
      } catch (err) {
        // NOT_FOUND ist eine Antwort ("den Ort gibt es nicht"), kein Fehler.
        if (err instanceof PlacesFehler && err.status === 'NOT_FOUND') return null
        throw err
      }
    },

    async websiteVon(placeId) {
      try {
        // Nur EIN Feld — die Preisstufe richtet sich nach dem, was man
        // anfragt. Wer Grunddaten mitbestellt und wegwirft, zahlt dafuer.
        const daten = await hole('/details/json', { place_id: placeId, fields: 'website' })
        return ((daten.result as RohOrt)?.website) ?? null
      } catch (err) {
        if (err instanceof PlacesFehler && err.status === 'NOT_FOUND') return null
        throw err
      }
    },

    async profil(placeId) {
      try {
        // ⚠ Nicht angeforderte Felder liefert Google gar nicht — ein
        // vergessenes `photos` saehe still aus wie ein Profil ohne Bilder.
        const daten = await hole('/details/json', {
          place_id: placeId,
          fields: `${GRUND_FELDER},${PROFIL_FELDER}`,
          language: 'de',
        })
        const roh = (daten.result as RohProfil) ?? {}
        const basis = zuBetrieb(roh)
        if (!basis) return null

        return {
          ...basis,
          fotos: roh.photos?.length ?? 0,
          oeffnungszeiten: Boolean(roh.opening_hours),
          telefon: roh.formatted_phone_number ?? null,
          betriebsstatus: roh.business_status ?? null,
        } satisfies Profil
      } catch (err) {
        if (err instanceof PlacesFehler && err.status === 'NOT_FOUND') return null
        throw err
      }
    },
  }
}
