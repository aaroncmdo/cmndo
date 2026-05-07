'use client'

// 2026-05-08: Blitzer-Layer für den Feldmodus — jetzt via Atudo (Blitzer.de)
// statt OSM. Liefert MOBILE Blitzer (type 1) zusätzlich zu stationären.
// CORS: Access-Control-Allow-Origin: * — direkt aus dem Browser callbar.
//
// Type-Codes (aus dem JayR-Skript-Original):
//   0,1,2,3,4,5,6 = verschiedene Blitzer-Kategorien (mobile, fest,
//   Rotlicht, Abschnitt, …). 1000 = Cluster-Pseudo-POI bei großem Zoom-
//   Out — wird in der Marker-Anzeige ignoriert.
//
// Lade-Strategie: BBox um die TBT-Route + 500m Puffer. Cache pro BBox
// 5 min damit Re-Renders/GPS-Jitter nicht spammen.

import type { Map as MapboxMap } from 'mapbox-gl'

export const BLITZER_SOURCE_ID = 'blitzer-src'
export const BLITZER_LAYER_ID = 'blitzer-layer'

const ATUDO_URL = 'https://cdn2.atudo.net/api/1.0/vl.php'
const cache = new Map<string, { features: GeoJSON.Feature[]; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export type BlitzerFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { id: string; type: string; vmax?: string; street?: string }
>

/**
 * BBox = [minLng, minLat, maxLng, maxLat] (Mapbox-Style).
 * Liefert mobile + stationäre Blitzer als GeoJSON-Features.
 */
export async function fetchBlitzerInBbox(
  bbox: [number, number, number, number],
): Promise<BlitzerFeature[]> {
  const key = bbox.map((n) => n.toFixed(3)).join(',')
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.features as BlitzerFeature[]
  }

  // Atudo erwartet box=lat_min,lng_min,lat_max,lng_max
  const [minLng, minLat, maxLng, maxLat] = bbox
  const url =
    `${ATUDO_URL}?type=0,1,2,3,4,5,6&box=${minLat.toFixed(6)},${minLng.toFixed(6)},${maxLat.toFixed(6)},${maxLng.toFixed(6)}`

  try {
    const res = await fetch(url, {
      // Atudo prüft Referer leicht; cmndo.vercel.app wird akzeptiert
      // (im Browser setzt der UA den Referer eh automatisch).
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[blitzer-atudo] HTTP', res.status)
      return []
    }
    const data = (await res.json()) as {
      pois?: Array<{
        id: string | number
        lat: string | number
        lng: string | number
        type: string | number
        vmax?: string | number
        street?: string
      }>
    }
    // Cluster-Pseudo-POIs (type=1000) bei zoomed-out Bbox aussortieren —
    // einzelne Standorte sind type 0-6.
    const features: BlitzerFeature[] = (data.pois ?? [])
      .filter((p) => Number(p.type) < 100)
      .map((p) => ({
        type: 'Feature',
        id: `blitzer-${p.id}`,
        geometry: {
          type: 'Point',
          coordinates: [Number(p.lng), Number(p.lat)],
        },
        properties: {
          id: String(p.id),
          type: String(p.type),
          vmax: p.vmax != null ? String(p.vmax) : undefined,
          street: p.street,
        },
      }))
    cache.set(key, { features, ts: Date.now() })
    return features
  } catch (err) {
    console.warn('[blitzer-atudo] fetch error:', err)
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
    // 2026-05-08: Type-1 (mobil) → lila Pulse, Rest (stationär) → rot.
    // Macht Mobile-Blitzer auf den ersten Blick unterscheidbar.
    map.addLayer({
      id: `${BLITZER_LAYER_ID}-halo`,
      type: 'circle',
      source: BLITZER_SOURCE_ID,
      paint: {
        'circle-radius': 18,
        'circle-color': [
          'case',
          ['==', ['get', 'type'], '1'], '#a855f7', // purple-500 mobil
          '#ef4444', // red-500 stationär
        ],
        'circle-opacity': 0.3,
        'circle-blur': 0.5,
      },
    })
    map.addLayer({
      id: BLITZER_LAYER_ID,
      type: 'circle',
      source: BLITZER_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'case',
          ['==', ['get', 'type'], '1'], '#9333ea', // purple-600 mobil
          '#dc2626', // red-600 stationär
        ],
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
