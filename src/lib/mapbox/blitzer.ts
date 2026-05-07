'use client'

// 2026-05-07: Blitzer-Layer für den Feldmodus.
// Datenquelle: OpenStreetMap via Overpass-API. Nodes mit
// `highway=speed_camera`. Kostenlos, EU-flächendeckend.
//
// Lade-Strategie: Bounding-Box um die TBT-Route + 500m Puffer. Cache
// pro BBox für 5 min damit Re-Renders nicht spammen.

import type { Map as MapboxMap } from 'mapbox-gl'

export const BLITZER_SOURCE_ID = 'blitzer-src'
export const BLITZER_LAYER_ID = 'blitzer-layer'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const cache = new Map<string, { features: GeoJSON.Feature[]; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export type BlitzerFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { id: string; direction?: string }
>

/**
 * BBox = [minLng, minLat, maxLng, maxLat] (Mapbox-Style).
 * Liefert speed_camera-Nodes als GeoJSON-Features.
 */
export async function fetchBlitzerInBbox(
  bbox: [number, number, number, number],
): Promise<BlitzerFeature[]> {
  const key = bbox.map((n) => n.toFixed(3)).join(',')
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.features as BlitzerFeature[]
  }

  // Overpass erwartet south, west, north, east — wir konvertieren.
  const [minLng, minLat, maxLng, maxLat] = bbox
  const query = `
    [out:json][timeout:10];
    (
      node["highway"="speed_camera"](${minLat},${minLng},${maxLat},${maxLng});
      node["enforcement"="maxspeed"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out body;
  `

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) {
      console.warn('[blitzer] Overpass HTTP', res.status)
      return []
    }
    const data = (await res.json()) as {
      elements?: Array<{ id: number; lat: number; lon: number; tags?: Record<string, string> }>
    }
    const features: BlitzerFeature[] = (data.elements ?? []).map((e) => ({
      type: 'Feature',
      id: `blitzer-${e.id}`,
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: {
        id: String(e.id),
        direction: e.tags?.direction,
      },
    }))
    cache.set(key, { features, ts: Date.now() })
    return features
  } catch (err) {
    console.warn('[blitzer] fetch error:', err)
    return []
  }
}

/**
 * Berechnet eine BBox um eine Routen-Polyline mit zusätzlichem Puffer.
 */
export function bboxForRoute(
  coords: Array<[number, number]>,
  bufferKm = 0.5,
): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
  }
  // ~111 km/° lat, ~70 km/° lng auf 50°N — grob genug für Puffer
  const latBuf = bufferKm / 111
  const lngBuf = bufferKm / 70
  return [minLng - lngBuf, minLat - latBuf, maxLng + lngBuf, maxLat + latBuf]
}

export type BlitzerLayerHandle = {
  update: (features: BlitzerFeature[]) => void
  remove: () => void
}

/**
 * Mountet Blitzer-Layer in Mapbox. Idempotent.
 */
export function attachBlitzerLayer(map: MapboxMap, initial: BlitzerFeature[] = []): BlitzerLayerHandle {
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: initial }

  if (!map.getSource(BLITZER_SOURCE_ID)) {
    map.addSource(BLITZER_SOURCE_ID, {
      type: 'geojson',
      data: fc,
    })
  } else {
    ;(map.getSource(BLITZER_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(fc)
  }

  if (!map.getLayer(BLITZER_LAYER_ID)) {
    // Zwei-Schicht: Pulse-Halo (großer transparenter Kreis) + zentraler Punkt.
    map.addLayer({
      id: `${BLITZER_LAYER_ID}-halo`,
      type: 'circle',
      source: BLITZER_SOURCE_ID,
      paint: {
        'circle-radius': 16,
        'circle-color': '#ef4444', // red-500
        'circle-opacity': 0.25,
        'circle-blur': 0.4,
      },
    })
    map.addLayer({
      id: BLITZER_LAYER_ID,
      type: 'circle',
      source: BLITZER_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#dc2626', // red-600
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
  }

  return {
    update(features: BlitzerFeature[]) {
      const src = map.getSource(BLITZER_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
      if (src) src.setData({ type: 'FeatureCollection', features })
    },
    remove() {
      try { if (map.getLayer(BLITZER_LAYER_ID)) map.removeLayer(BLITZER_LAYER_ID) } catch { /* noop */ }
      try { if (map.getLayer(`${BLITZER_LAYER_ID}-halo`)) map.removeLayer(`${BLITZER_LAYER_ID}-halo`) } catch { /* noop */ }
      try { if (map.getSource(BLITZER_SOURCE_ID)) map.removeSource(BLITZER_SOURCE_ID) } catch { /* noop */ }
    },
  }
}

// Wir importieren den Mapbox-Type lazy weil wir den File auch ohne Mapbox-Init
// laden können sollen (Pre-Flight in Helpers).
import type * as mapboxgl from 'mapbox-gl' // type-only, keine runtime dep
