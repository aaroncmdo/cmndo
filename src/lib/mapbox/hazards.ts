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

export const FLOW_SOURCE_ID = 'traffic-flow-src'
export const FLOW_LAYER_ID = 'traffic-flow-layer'

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

// 2026-05-07: HERE Traffic Flow v7 — Stau-Visualisierung wie Google Maps.
// Liefert Polylines mit currentFlow.speed vs. freeFlow.speed → Färbung
// grün/gelb/rot je nach Verlangsamung.

export type FlowFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { jamFactor: number; speedRatio: number }
>

const flowCache = new Map<string, { features: FlowFeature[]; ts: number }>()
const FLOW_CACHE_TTL_MS = 60 * 1000 // Stau ändert sich schnell

export async function fetchHereFlow(
  bbox: [number, number, number, number],
): Promise<FlowFeature[]> {
  const key = process.env.NEXT_PUBLIC_HERE_API_KEY
  if (!key) return []

  const [minLng, minLat, maxLng, maxLat] = bbox
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const latM = ((maxLat - minLat) * 111_000) / 2
  const lngM = ((maxLng - minLng) * 70_000) / 2
  const radius = Math.min(50_000, Math.max(1_000, Math.round(Math.sqrt(latM * latM + lngM * lngM))))

  const cacheKey = `${centerLng.toFixed(3)},${centerLat.toFixed(3)},${radius}`
  const cached = flowCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < FLOW_CACHE_TTL_MS) return cached.features

  try {
    const res = await fetch(`https://data.traffic.hereapi.com/v7/flow?apiKey=${encodeURIComponent(key)}`, {
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
      console.warn('[here-flow] HTTP', res.status)
      return []
    }
    const data = (await res.json()) as {
      results?: Array<{
        location?: { shape?: { links?: Array<{ points?: Array<{ lat: number; lng: number }> }> } }
        currentFlow?: { speed?: number; freeFlow?: number; jamFactor?: number }
      }>
    }
    const features: FlowFeature[] = []
    for (const r of data.results ?? []) {
      const links = r.location?.shape?.links ?? []
      const cf = r.currentFlow
      const speed = cf?.speed ?? 0
      const free = cf?.freeFlow ?? 0
      const jamFactor = cf?.jamFactor ?? 0
      const speedRatio = free > 0 ? speed / free : 1
      for (const link of links) {
        const points = link.points ?? []
        if (points.length < 2) continue
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: points.map((p) => [p.lng, p.lat]),
          },
          properties: { jamFactor, speedRatio },
        })
      }
    }
    flowCache.set(cacheKey, { features, ts: Date.now() })
    return features
  } catch (err) {
    console.warn('[here-flow] error:', err)
    return []
  }
}

export type FlowLayerHandle = {
  update: (features: FlowFeature[]) => void
  remove: () => void
}

export function attachFlowLayer(map: MapboxMap, initial: FlowFeature[] = []): FlowLayerHandle {
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: initial }

  if (!map.getSource(FLOW_SOURCE_ID)) {
    map.addSource(FLOW_SOURCE_ID, { type: 'geojson', data: fc })
  } else {
    ;(map.getSource(FLOW_SOURCE_ID) as { setData: (d: GeoJSON.FeatureCollection) => void }).setData(fc)
  }

  if (!map.getLayer(FLOW_LAYER_ID)) {
    map.addLayer({
      id: FLOW_LAYER_ID,
      type: 'line',
      source: FLOW_SOURCE_ID,
      slot: 'middle', // unter Labels, über Roads
      paint: {
        // Farbskala: jamFactor 0-3 = grün, 4-6 = amber, 7-10 = rot
        // (Mapbox Standard interpoliert linear)
        'line-color': [
          'interpolate', ['linear'], ['get', 'jamFactor'],
          0, '#10b981', // emerald-500
          3, '#84cc16', // lime-500
          5, '#f59e0b', // amber-500
          7, '#f97316', // orange-500
          10, '#dc2626', // red-600
        ],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, 3,
          16, 7,
          18, 12,
        ],
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    } as Parameters<typeof map.addLayer>[0])
  }

  return {
    update(features: FlowFeature[]) {
      const src = map.getSource(FLOW_SOURCE_ID) as { setData: (d: GeoJSON.FeatureCollection) => void } | undefined
      if (src) src.setData({ type: 'FeatureCollection', features })
    },
    remove() {
      try { if (map.getLayer(FLOW_LAYER_ID)) map.removeLayer(FLOW_LAYER_ID) } catch { /* noop */ }
      try { if (map.getSource(FLOW_SOURCE_ID)) map.removeSource(FLOW_SOURCE_ID) } catch { /* noop */ }
    },
  }
}

export function attachHazardLayer(map: MapboxMap, initial: HazardFeature[] = []): HazardLayerHandle {
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: initial }

  if (!map.getSource(HAZARD_SOURCE_ID)) {
    map.addSource(HAZARD_SOURCE_ID, { type: 'geojson', data: fc })
  } else {
    ;(map.getSource(HAZARD_SOURCE_ID) as { setData: (d: GeoJSON.FeatureCollection) => void }).setData(fc)
  }

  if (!map.getLayer(HAZARD_LAYER_ID)) {
    // 2026-05-08: Hazards (Baustellen/Unfälle/Sperrungen) deutlich größer
    // gerendert + slot='top' damit sie auch in der Navi-Sicht (Pitch 70,
    // Zoom 18+) sofort auffallen. Halo + Stroke verstärken Sichtbarkeit
    // gegen die hellen Mapbox-Standard-Tiles.
    map.addLayer({
      id: `${HAZARD_LAYER_ID}-halo`,
      type: 'circle',
      source: HAZARD_SOURCE_ID,
      slot: 'top',
      paint: {
        'circle-radius': 22,
        'circle-color': '#f59e0b', // amber-500
        'circle-opacity': 0.4,
        'circle-blur': 0.6,
      },
    } as Parameters<typeof map.addLayer>[0])
    map.addLayer({
      id: HAZARD_LAYER_ID,
      type: 'circle',
      source: HAZARD_SOURCE_ID,
      slot: 'top',
      paint: {
        'circle-radius': 8,
        'circle-color': '#d97706', // amber-600
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    } as Parameters<typeof map.addLayer>[0])
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
