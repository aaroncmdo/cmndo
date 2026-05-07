// AAR-872: Server-side Geocoding-Helper. Wandelt einen rohen Adress-String
// (z.B. aus dem `location`-Feld eines GCal/CalDAV-Events) in lat/lng +
// formatted_address + place_id um. Genutzt vom „Stop hinzufuegen"-Server-
// Action damit der Privat-Stop sofort einen Map-Pin bekommt.
//
// Pattern uebernommen aus dispatch/leads/[id]/_actions/geocode.ts —
// Region DE Bias, Result-Object statt throw.

export type GeocodeResult = {
  lat: number
  lng: number
  formatted_address: string
  place_id: string | null
}

export type GeocodeReturn =
  | { ok: true; data: GeocodeResult }
  | { ok: false; error: string }

export async function geocodeAddress(rawAddress: string): Promise<GeocodeReturn> {
  const cleaned = rawAddress.trim()
  if (!cleaned) return { ok: false, error: 'Adresse leer' }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return { ok: false, error: 'Google Maps API Key fehlt' }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(cleaned)}&region=de&key=${key}`
    const resp = await fetch(url, { cache: 'no-store' })
    const data = (await resp.json()) as {
      status: string
      results?: Array<{
        geometry?: { location?: { lat: number; lng: number } }
        formatted_address?: string
        place_id?: string
      }>
    }
    if (data.status !== 'OK' || !data.results?.length) {
      return { ok: false, error: `Geocoding fehlgeschlagen: ${data.status}` }
    }
    const first = data.results[0]
    const loc = first.geometry?.location
    if (!loc) return { ok: false, error: 'Keine Koordinaten in Geocoding-Antwort' }
    return {
      ok: true,
      data: {
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        formatted_address: first.formatted_address ?? cleaned,
        place_id: first.place_id ?? null,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Geocoding-Exception' }
  }
}
