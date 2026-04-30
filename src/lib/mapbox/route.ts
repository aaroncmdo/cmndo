// AAR-864: Adresse-zu-Adresse-Route via Mapbox Directions API.
//
// Erweitert lib/mapbox/eta.ts (das nur LatLng→Adresse kann) um den
// Adresse→Adresse-Use-Case mit Geocode-Cache. Nutzung in
// lib/termine/verlegung-vorschlaege.ts — pro Modal-Lifecycle wird ein
// frischer Cache übergeben, damit gleiche Adressen nicht doppelt
// gegen die API laufen (typisch: Vor-/Nach-Termine wiederholen sich
// in mehreren Tageslücken).

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

type LngLat = [number, number]

/** Aufrufer-übergebener Cache. Lebenszeit = Modal-Lifecycle. */
export type RouteCache = {
  geocode: Map<string, LngLat | null>
  routes: Map<string, number | null>
}

export function createRouteCache(): RouteCache {
  return {
    geocode: new Map(),
    routes: new Map(),
  }
}

async function geocode(adresse: string, cache: RouteCache): Promise<LngLat | null> {
  const key = adresse.trim().toLowerCase()
  if (cache.geocode.has(key)) return cache.geocode.get(key) ?? null
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(adresse)}.json` +
      `?country=de&limit=1&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    const center = data?.features?.[0]?.center as LngLat | undefined
    const result = center ?? null
    cache.geocode.set(key, result)
    return result
  } catch {
    cache.geocode.set(key, null)
    return null
  }
}

/**
 * AAR-864: Fahrtzeit zwischen zwei Lat/Lng-Punkten in Minuten — ohne
 * Geocoding-Call, direkt an Mapbox Directions. Wird genutzt wenn beide
 * Endpunkte schon Koordinaten haben (Termine + Besichtigungsort sind
 * via faelle.besichtigungsort_lat/lng + sachverstaendige.standort_lat/lng
 * in der DB vorhanden).
 */
export async function fahrtMinutenLatLng(
  vonLat: number,
  vonLng: number,
  nachLat: number,
  nachLng: number,
  cache: RouteCache,
): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null
  const key = `${vonLat.toFixed(5)},${vonLng.toFixed(5)}|${nachLat.toFixed(5)},${nachLng.toFixed(5)}`
  if (cache.routes.has(key)) return cache.routes.get(key) ?? null
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${vonLng},${vonLat};${nachLng},${nachLat}` +
      `?overview=false&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    const dauerSek = data?.routes?.[0]?.duration as number | undefined
    if (!dauerSek) {
      cache.routes.set(key, null)
      return null
    }
    const min = Math.ceil(dauerSek / 60)
    cache.routes.set(key, min)
    return min
  } catch {
    cache.routes.set(key, null)
    return null
  }
}

/**
 * Fahrtzeit von Adresse A zu Adresse B in Minuten. null bei Fehler.
 * Beide Geocodings + die Route werden über den Cache memoized.
 * Fallback wenn Lat/Lng nicht vorhanden — siehe fahrtMinutenLatLng als
 * bevorzugten Weg.
 */
export async function fahrtMinuten(
  vonAdresse: string,
  nachAdresse: string,
  cache: RouteCache,
): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null
  const key = `${vonAdresse.trim().toLowerCase()}|${nachAdresse.trim().toLowerCase()}`
  if (cache.routes.has(key)) return cache.routes.get(key) ?? null

  const [von, nach] = await Promise.all([
    geocode(vonAdresse, cache),
    geocode(nachAdresse, cache),
  ])
  if (!von || !nach) {
    cache.routes.set(key, null)
    return null
  }

  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${von[0]},${von[1]};${nach[0]},${nach[1]}` +
      `?overview=false&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    const dauerSek = data?.routes?.[0]?.duration as number | undefined
    if (!dauerSek) {
      cache.routes.set(key, null)
      return null
    }
    const min = Math.ceil(dauerSek / 60)
    cache.routes.set(key, min)
    return min
  } catch {
    cache.routes.set(key, null)
    return null
  }
}
