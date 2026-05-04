// AAR-CMM Mapbox-Matrix: ETA von einem Origin zu N Destinations in einem
// HTTP-Call. Genutzt von:
//   - dispatch/kalender (Spontan-Termin-Modal: SV-Vorschläge nach Fahrtzeit)
//   - lib/dispatch/findBestSV (Score + Adjacent-Termin-Erreichbarkeit)
//
// Mapbox-Limits: 25 Koordinaten pro Request (1 Origin + 24 Destinations).
// Bei >24 Destinations chunken wir automatisch und stitchen die Ergebnisse.

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? process.env.MAPBOX_TOKEN ?? ''

export type LatLng = { lat: number; lng: number }

/**
 * Liefert ETA in Minuten vom Origin zu jeder Destination. Reihenfolge =
 * Reihenfolge des `destinations`-Arrays. Bei Mapbox-Fehler/Timeout pro
 * Chunk: null-Einträge an den entsprechenden Indizes (kein Throw).
 */
export async function mapboxEtaMatrix(
  origin: LatLng,
  destinations: LatLng[],
): Promise<Array<number | null>> {
  if (!MAPBOX_TOKEN || destinations.length === 0) {
    return destinations.map(() => null)
  }

  const result: Array<number | null> = new Array(destinations.length).fill(null)
  const CHUNK = 24
  for (let i = 0; i < destinations.length; i += CHUNK) {
    const slice = destinations.slice(i, i + CHUNK)
    const coords = [
      `${origin.lng},${origin.lat}`,
      ...slice.map((d) => `${d.lng},${d.lat}`),
    ].join(';')
    try {
      const url =
        `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
        `?annotations=duration&sources=0&access_token=${MAPBOX_TOKEN}`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const row = data?.durations?.[0] as Array<number | null> | undefined
      if (!row) continue
      for (let j = 0; j < slice.length; j++) {
        const sec = row[j + 1] // [0] = origin→origin = 0
        result[i + j] = typeof sec === 'number' ? Math.ceil(sec / 60) : null
      }
    } catch (err) {
      console.warn('[mapboxEtaMatrix] Chunk fehlgeschlagen:', err)
    }
  }
  return result
}
