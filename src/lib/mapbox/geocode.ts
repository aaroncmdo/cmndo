// AAR-908: Mapbox-Geocoding-Helper. String-Adresse → Koordinaten + formatierte
// Adresse. Wird von createLeadFromMiniWizard genutzt, damit der findBestSV-
// Aufruf direkt nach Lead-Insert Koordinaten hat.

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const SERVER_TOKEN = process.env.MAPBOX_TOKEN ?? MAPBOX_TOKEN

export type GeocodeResult = {
  lat: number
  lng: number
  formatted: string
  placeId: string | null
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
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?country=de&limit=1&access_token=${SERVER_TOKEN}`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{
        center: [number, number]
        place_name?: string
        id?: string
      }>
    }
    const f = data?.features?.[0]
    if (!f?.center) return null
    const [lng, lat] = f.center
    return {
      lat,
      lng,
      formatted: f.place_name ?? cleaned,
      placeId: f.id ?? null,
    }
  } catch (err) {
    console.warn('[geocode] failed:', err instanceof Error ? err.message : err)
    return null
  }
}
