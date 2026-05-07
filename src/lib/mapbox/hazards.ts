'use client'

// 2026-05-07: HERE Traffic API v7 Hazards-Layer.
// Mobile Blitzer sind via HERE Standard-API NICHT zugänglich (HERE Map
// Content B2B-License nötig). Aber: HERE liefert Verkehrshindernisse
// (Baustellen, Unfälle, Sperrungen, Pannen-Fahrzeuge) — die helfen dem SV
// beim Anfahrts-Routing genauso wie Blitzer-Warnungen.
//
// Endpoint: POST https://data.traffic.hereapi.com/v7/incidents
// Auth: ?apiKey=NEXT_PUBLIC_HERE_API_KEY (mit `Hv9zvEAgWC4Y2xCoqSaMpMjjXYrgYtnFui_ULfi4Ux0` getestet)

import type { Map as MapboxMap } from 'mapbox-gl'

export const HAZARD_SOURCE_ID = 'hazard-src'
export const HAZARD_LAYER_ID = 'hazard-layer'

export type HazardFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { id: string; type: string; description: string; criticality: string }
>

const cache = new Map<string, { features: HazardFeature[]; ts: number }>()
const CACHE_TTL_MS = 2 * 60 * 1000 // Verkehr ändert sich schneller als Blitzer

const HERE_TRAFFIC_URL = 'https://data.traffic.hereapi.com/v7/incidents'

export async function fetchHereHazards(
  bbox: [number, number, number, number],
): Promise<HazardFeature[]> {
  const key = process.env.NEXT_PUBLIC_HERE_API_KEY
  if (!key) return []

  const [minLng, minLat, maxLng, maxLat] = bbox
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  // Approx Radius in m: nimm die Diagonale der BBox / 2.
  const latM = ((maxLat - minLat) * 111_000) / 2
  const lngM = ((maxLng - minLng) * 70_000) / 2
  const radius = Math.min(50_000, Math.max(1_000, Math.round(Math.sqrt(latM * latM + lngM * lngM))))

  const cacheKey = `${centerLng.toFixed(3)},${centerLat.toFixed(3)},${radius}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.features
  }

  try {
    const res = await fetch(`${HERE_TRAFFIC_URL}?apiKey=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        in: { type: 'circle', center: { lat: centerLat, lng: centerLng }, radius },
        locationReferencing: ['shape'],
        lang: 'de-DE',
        units: 'metric',
      }),
    })
    if (!res.ok) {
      console.warn('[here-hazards] HTTP', res.status)
      return []
    }
    const data = (await res.json()) as {
      results?: Array<{
        incidentDetails?: {
          id?: string
          type?: string
          description?: { value?: string }
          criticality?: string
        }
        location?: { shape?: { links?: Array<{ points?: Array<{ lat: number; lng: number }> }> } }
      }>
    }
    const features: HazardFeature[] = []
    for (const r of data.results ?? []) {
      const det = r.incidentDetails
      const firstPoint = r.location?.shape?.links?.[0]?.points?.[0]
      if (!det || !firstPoint) continue
      features.push({
        type: 'Feature',
        id: `hazard-${det.id ?? Math.random()}`,
        geometry: { type: 'Point', coordinates: [firstPoint.lng, firstPoint.lat] },
        properties: {
          id: String(det.id ?? ''),
          type: det.type ?? 'unknown',
          description: det.description?.value ?? '',
          criticality: det.criticality ?? 'low',
        },
      })
    }
    cache.set(cacheKey, { features, ts: Date.now() })
    return features
  } catch (err) {
    console.warn('[here-hazards] fetch error:', err)
    return []
  }
}

export type HazardLayerHandle = {
  update: (features: HazardFeature[]) => void
  remove: () => void
}

export function attachHazardLayer(map: MapboxMap, initial: HazardFeature[] = []): HazardLayerHandle {
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: initial }

  if (!map.getSource(HAZARD_SOURCE_ID)) {
    map.addSource(HAZARD_SOURCE_ID, { type: 'geojson', data: fc })
  } else {
    ;(map.getSource(HAZARD_SOURCE_ID) as { setData: (d: GeoJSON.FeatureCollection) => void }).setData(fc)
  }

  if (!map.getLayer(HAZARD_LAYER_ID)) {
    // Amber/orange Pulse-Marker, kleiner als Blitzer (rote sind kritischer)
    map.addLayer({
      id: `${HAZARD_LAYER_ID}-halo`,
      type: 'circle',
      source: HAZARD_SOURCE_ID,
      paint: {
        'circle-radius': 12,
        'circle-color': '#f59e0b', // amber-500
        'circle-opacity': 0.25,
        'circle-blur': 0.5,
      },
    })
    map.addLayer({
      id: HAZARD_LAYER_ID,
      type: 'circle',
      source: HAZARD_SOURCE_ID,
      paint: {
        'circle-radius': 4,
        'circle-color': '#d97706', // amber-600
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }

  return {
    update(features: HazardFeature[]) {
      const src = map.getSource(HAZARD_SOURCE_ID) as { setData: (d: GeoJSON.FeatureCollection) => void } | undefined
      if (src) src.setData({ type: 'FeatureCollection', features })
    },
    remove() {
      try { if (map.getLayer(HAZARD_LAYER_ID)) map.removeLayer(HAZARD_LAYER_ID) } catch { /* noop */ }
      try { if (map.getLayer(`${HAZARD_LAYER_ID}-halo`)) map.removeLayer(`${HAZARD_LAYER_ID}-halo`) } catch { /* noop */ }
      try { if (map.getSource(HAZARD_SOURCE_ID)) map.removeSource(HAZARD_SOURCE_ID) } catch { /* noop */ }
    },
  }
}
