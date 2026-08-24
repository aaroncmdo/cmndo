// Adress-Vorschlaege ueber Mapbox — der Ersatz fuer Google Places Autocomplete.
//
// WARUM: Google Places lief am 24.08.2026 in ein gesetztes Tageskontingent. Die
// Antwort kam mit HTTP 200 und dem Fehler IM RUMPF ("You have exceeded your daily
// request quota"), das Widget lud normal, und die Vorschlagsliste blieb einfach
// leer. Fuer Kundinnen hiess das: Adresse eintippen, nichts passiert, kein Hinweis,
// kein Weiterkommen — im Finder, in der Schadenmeldung, im Magic-Link-Flow und in
// allen Registrierungen gleichzeitig. Kein Statuscode-Monitoring haette das gesehen.
//
// Mapbox ist auf denselben Seiten ohnehin im Einsatz (die Karte), der Token ist in
// allen Deploy-Workflows verdrahtet, und das Kontingent ist um Groessenordnungen
// grosszuegiger. Zusaetzlich liegt die Drosselung jetzt bei UNS: Googles Widget
// feuerte pro Tastenanschlag (gemessen: vier Anfragen fuer das Wort "Leichlingen"),
// hier entscheidet der Aufrufer ueber das Entprellen.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export type AdressVorschlag = {
  /** Vollstaendige, anzeigbare Adresse — was im Eingabefeld landet. */
  adresse: string
  plz: string
  /** Strasse + Hausnummer, soweit Mapbox sie liefert. */
  strasse: string
  stadt: string
  lat: number
  lng: number
  /** Mapbox-Feature-ID. Bewusst dieselbe Rolle wie Googles place_id. */
  place_id: string
}

type MapboxFeature = {
  id?: string
  text?: string
  address?: string
  place_name?: string
  center?: [number, number]
  context?: Array<{ id?: string; text?: string }>
}

/** Zieht PLZ und Ort aus dem `context`-Array eines Mapbox-Features.
 *  Mapbox liefert die Hierarchie als Liste mit typisierten IDs
 *  ("postcode.123", "place.456") — die Reihenfolge ist NICHT garantiert,
 *  deshalb wird ueber den Praefix gesucht statt ueber den Index. */
function ausKontext(f: MapboxFeature): { plz: string; stadt: string } {
  let plz = ''
  let stadt = ''
  for (const c of f.context ?? []) {
    const id = c.id ?? ''
    if (!plz && id.startsWith('postcode')) plz = c.text ?? ''
    else if (!stadt && (id.startsWith('place') || id.startsWith('locality'))) stadt = c.text ?? ''
  }
  return { plz, stadt }
}

export function mapboxFeatureZuVorschlag(f: MapboxFeature): AdressVorschlag | null {
  if (!f?.center || f.center.length !== 2) return null
  const [lng, lat] = f.center
  const { plz, stadt } = ausKontext(f)
  // Bei types=address ist `text` die Strasse und `address` die Hausnummer.
  // Bei einem reinen Ort-Treffer gibt es keine Hausnummer — dann bleibt strasse leer,
  // statt den Ortsnamen faelschlich als Strasse auszugeben.
  const istAdresse = (f.id ?? '').startsWith('address')
  const strasse = istAdresse ? [f.text, f.address].filter(Boolean).join(' ').trim() : ''
  return {
    adresse: f.place_name ?? f.text ?? '',
    plz,
    // Ein Ort-Treffer traegt seinen Namen in `text`, nicht im Kontext.
    stadt: stadt || (istAdresse ? '' : (f.text ?? '')),
    strasse,
    lat,
    lng,
    place_id: f.id ?? '',
  }
}

/** Liefert bis zu `limit` Adress-Vorschlaege. Leeres Array bei fehlendem Token,
 *  zu kurzer Eingabe, Netzfehler oder Abbruch — der Aufrufer zeigt dann nichts an,
 *  statt einen Fehler zu werfen. */
export async function sucheAdressVorschlaege(
  eingabe: string,
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<AdressVorschlag[]> {
  const q = eingabe.trim()
  if (!TOKEN || q.length < 3) return []

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?country=de&language=de&limit=${opts.limit ?? 5}&autocomplete=true` +
    `&types=address,place,postcode,locality,neighborhood` +
    `&access_token=${TOKEN}`

  try {
    const res = await fetch(url, { signal: opts.signal })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: MapboxFeature[] }
    return (data.features ?? [])
      .map(mapboxFeatureZuVorschlag)
      .filter((v): v is AdressVorschlag => v !== null && v.adresse.length > 0)
  } catch {
    // AbortError beim Tippen ist der Normalfall, kein Fehler.
    return []
  }
}
