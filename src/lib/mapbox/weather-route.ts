'use client'

// 2026-05-08 (C12): Wetter-Animationen entlang der Route.
//
// Idee: Aaron-Brief — Wetter wird per OpenWeatherMap an mehreren Stellen
// der primary-Route gesampled, gleiche Wetter-Codes werden zu Regionen
// geclustered, und über jeder Region rendern wir entsprechende
// Particles (Schnee/Regen/Sturm). So sieht der SV beim Anfahren schon
// auf der Karte „dort wird's regnen / dort schneit's noch".
//
// Architektur:
//   - sampleWeatherAlongRoute(coords) — sample-points alle ~3km, fetch
//     OpenWeatherMap-Codes via /api/weather
//   - WeatherFx Custom-Layer (three.js) — particles pro Region
//   - clusterWeatherSamples — benachbarte gleiche Codes zu einer Region

import { haversineMetersLngLat } from './turn-by-turn'

export type WeatherSample = {
  lng: number
  lat: number
  /** OpenWeatherMap weather code — siehe https://openweathermap.org/weather-conditions */
  weatherId: number
}

export type WeatherRegion = {
  type: 'rain' | 'snow' | 'storm' | 'clear'
  /** Center der Region in [lng, lat]. */
  center: [number, number]
  /** Approximate radius in Metern — wir blenden Particles innerhalb dieses
   *  Radius an. */
  radiusM: number
}

const WEATHER_SAMPLE_INTERVAL_KM = 3
const REGION_CLUSTER_RADIUS_KM = 5

/**
 * Open-Weather-Code → Wetter-Typ-Mapping.
 *   2xx → storm, 3xx + 5xx → rain, 6xx → snow, sonst clear.
 */
export function classifyWeatherCode(weatherId: number): WeatherRegion['type'] {
  if (weatherId >= 200 && weatherId < 300) return 'storm'
  if ((weatherId >= 300 && weatherId < 400) || (weatherId >= 500 && weatherId < 600)) return 'rain'
  if (weatherId >= 600 && weatherId < 700) return 'snow'
  return 'clear'
}

/**
 * Sample-Points entlang einer Polyline mit konstantem Abstand.
 * Inkludiert den ersten und letzten Punkt damit Anfang/Ende der Route
 * abgedeckt sind.
 */
function samplePoints(coords: Array<[number, number]>, intervalKm: number): Array<[number, number]> {
  if (coords.length < 2) return [...coords]
  const samples: Array<[number, number]> = [coords[0]]
  let acc = 0
  for (let i = 1; i < coords.length; i++) {
    const dM = haversineMetersLngLat(coords[i - 1], coords[i])
    acc += dM / 1000
    if (acc >= intervalKm) {
      samples.push(coords[i])
      acc = 0
    }
  }
  // Letzten Punkt anhängen falls nicht schon dabei
  const last = coords[coords.length - 1]
  const tail = samples[samples.length - 1]
  if (last[0] !== tail[0] || last[1] !== tail[1]) samples.push(last)
  return samples
}

/**
 * Holt für jede Sample-Position das aktuelle Wetter via /api/weather.
 * Server-side hat 5-min in-memory-Cache. Parallele Fetches in 5er-Batches
 * damit keine Browser-Connection-Limits hit.
 */
export async function sampleWeatherAlongRoute(
  coords: Array<[number, number]>,
  options: { signal?: AbortSignal; intervalKm?: number } = {},
): Promise<WeatherSample[]> {
  const intervalKm = options.intervalKm ?? WEATHER_SAMPLE_INTERVAL_KM
  if (coords.length < 2) return []
  const points = samplePoints(coords, intervalKm)
  const out: WeatherSample[] = []

  const BATCH = 5
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH).map(async ([lng, lat]) => {
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`, {
          signal: options.signal,
        })
        if (!res.ok) return null
        const data = (await res.json()) as { weather_id?: number }
        if (typeof data.weather_id !== 'number') return null
        return { lng, lat, weatherId: data.weather_id } as WeatherSample
      } catch {
        return null
      }
    })
    const chunk = await Promise.all(batch)
    for (const c of chunk) if (c) out.push(c)
  }
  return out
}

/**
 * Cluster benachbarte Samples mit gleicher Wetter-Klasse zu einer
 * Region. Reduziert die Anzahl Particle-Systems die wir rendern müssen.
 *
 * Algorithmus: greedy von links nach rechts. Wir sammeln Samples gleicher
 * Klasse, die jeweils < REGION_CLUSTER_RADIUS_KM voneinander entfernt
 * sind, in einer Group. Center = arithmetisches Mittel der Coords der
 * Group. Radius = max-Distance vom Center + 1.5 km Puffer.
 */
export function clusterWeatherSamples(samples: WeatherSample[]): WeatherRegion[] {
  if (samples.length === 0) return []

  const regions: WeatherRegion[] = []
  let currentClass: WeatherRegion['type'] | null = null
  let currentGroup: WeatherSample[] = []

  const flush = () => {
    if (currentGroup.length === 0 || currentClass == null || currentClass === 'clear') {
      currentGroup = []
      currentClass = null
      return
    }
    const lngSum = currentGroup.reduce((s, w) => s + w.lng, 0)
    const latSum = currentGroup.reduce((s, w) => s + w.lat, 0)
    const center: [number, number] = [lngSum / currentGroup.length, latSum / currentGroup.length]
    let maxDist = 0
    for (const s of currentGroup) {
      const d = haversineMetersLngLat(center, [s.lng, s.lat])
      if (d > maxDist) maxDist = d
    }
    regions.push({ type: currentClass, center, radiusM: maxDist + 1500 })
    currentGroup = []
    currentClass = null
  }

  for (const s of samples) {
    const klass = classifyWeatherCode(s.weatherId)
    if (klass !== currentClass) {
      flush()
      currentClass = klass
      currentGroup = [s]
      continue
    }
    // Same class — check if next sample is within cluster-radius
    const last = currentGroup[currentGroup.length - 1]
    const dKm = haversineMetersLngLat([last.lng, last.lat], [s.lng, s.lat]) / 1000
    if (dKm > REGION_CLUSTER_RADIUS_KM) {
      flush()
      currentClass = klass
      currentGroup = [s]
    } else {
      currentGroup.push(s)
    }
  }
  flush()

  return regions
}
