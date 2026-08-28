// AAR-908: Mapbox-Geocoding-Helper. String-Adresse → Koordinaten + formatierte
// Adresse. Wird von createLeadFromMiniWizard genutzt, damit der findBestSV-
// Aufruf direkt nach Lead-Insert Koordinaten hat.
//
// 28.08.2026 — zwei Ergaenzungen, beide aus dem Entry-Point-Sweep:
//
// 1. PLZ + ORT werden jetzt mitgenommen. Mapbox liefert sie im `context` des Features;
//    hier wurden sie bisher weggeworfen. `leads.unfallort_plz` blieb dadurch leer — und
//    genau die Spalte liest `convertLeadToClaim`, um `claims.schadenort_plz` zu fuellen
//    (s. src/lib/kunde/schaden-melden.ts:148, "B5-Fix"). Ein Fall aus dem Mini-Wizard hatte
//    deshalb nie eine Schadenort-PLZ, obwohl der Kunde "50667" eingetippt hatte.
//    `unfallort_ort` wiederum liest der Dead-Pin-Notify-Kontext.
//
// 2. `language=de`. Ohne den Parameter antwortet Mapbox englisch — gespeichert wurde
//    "Domkloster 4, 50667 Köln, Germany" statt "… Deutschland". Der Autocomplete-Pfad
//    setzt ihn seit jeher; die beiden Wege lieferten also unterschiedliche Schreibweisen
//    derselben Adresse.
//
// Die Transformation kommt bewusst aus `mapboxFeatureZuVorschlag` — EINE Auswertung des
// Antwortformats fuer Autocomplete UND Server-Geocoding. Zwei getrennte Auswertungen waren
// die Wurzel des Stadtteil-statt-Stadt-Fehlers (place vs. locality).

import { mapboxFeatureZuVorschlag, type MapboxFeature } from './adress-vorschlaege'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const SERVER_TOKEN = process.env.MAPBOX_TOKEN ?? MAPBOX_TOKEN

export type GeocodeResult = {
  lat: number
  lng: number
  formatted: string
  placeId: string | null
  /** PLZ aus dem Mapbox-`context` — Ziel: leads.unfallort_plz → claims.schadenort_plz. */
  plz: string | null
  /** Stadt (nicht Stadtteil!) — Ziel: leads.unfallort_ort. */
  ort: string | null
}

/** Server-side Mapbox-Geocoding fuer einen Adress-String.
 *  Liefert null bei API-Fehler, leerem Result oder fehlendem Token —
 *  Caller faellt sauber auf "kein SV-Match" zurueck. */
export async function geocodeAdresse(adresse: string): Promise<GeocodeResult | null> {
  if (!SERVER_TOKEN) return null
  const cleaned = adresse.trim()
  if (cleaned.length < 3) return null

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json` +
        `?country=de&language=de&limit=1&access_token=${SERVER_TOKEN}`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { features?: MapboxFeature[] }
    const f = data?.features?.[0]
    if (!f) return null

    const v = mapboxFeatureZuVorschlag(f)
    if (!v) return null

    return {
      lat: v.lat,
      lng: v.lng,
      formatted: v.adresse || cleaned,
      placeId: v.place_id || null,
      plz: v.plz || null,
      ort: v.stadt || null,
    }
  } catch (err) {
    console.warn('[geocode] failed:', err instanceof Error ? err.message : err)
    return null
  }
}
