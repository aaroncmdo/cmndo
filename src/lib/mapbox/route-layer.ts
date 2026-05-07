'use client'

// Route-Polyline Helpers — eine Variante pro Use-Case:
//   'main' (default) — solid claimondo-navy. Default Tagesroute.
//   'active-green' — solid grün. Reserviert für Live-Modus / Fokus.

import type { Map as MapboxMap } from 'mapbox-gl'

type Variant = 'main' | 'active-green'

const SOURCES: Record<Variant, string> = {
  'main': 'route-main',
  'active-green': 'route-active-green',
}

const LINE_LAYERS: Record<Variant, string> = {
  'main': 'route-main-line',
  'active-green': 'route-active-green-line',
}

const CASING_LAYERS: Record<Variant, string> = {
  'main': 'route-main-casing',
  'active-green': 'route-active-green-casing',
}

const GLOW_LAYERS: Record<Variant, string> = {
  'main': 'route-main-glow',
  'active-green': 'route-active-green-glow',
}

function toGeoJson(coords: Array<[number, number]>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
}

// 2026-05-08: Mapbox Standard Style hat einen `slot`-Mechanismus statt der
// klassischen layer-Reihenfolge. `top` = über allen Buildings + Labels,
// `middle` = über Roads aber unter Labels, `bottom` = unter Roads.
// Für eine Navi-Linie wollen wir `top` damit auch 3D-Buildings (die im
// Standard-Style einen eigenen Slot haben) die Linie nicht überdecken.
const ROUTE_SLOT = 'top' as const

export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  variant: Variant = 'main',
): void {
  const sourceId = SOURCES[variant]
  const lineId = LINE_LAYERS[variant]
  const casingId = CASING_LAYERS[variant]
  const glowId = GLOW_LAYERS[variant]

  const feature = toGeoJson(coords)
  const existingSource = map.getSource(sourceId) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(feature as GeoJSON.Feature)
    // Bei Re-Renders den Stack-Top wiederherstellen — falls inzwischen
    // andere Layer (Blitzer/Hazards) darüber gemounted wurden, soll die
    // Route trotzdem oben bleiben.
    for (const id of [glowId, casingId, lineId]) {
      if (map.getLayer(id)) {
        try { map.moveLayer(id) } catch { /* noop */ }
      }
    }
    return
  }

  map.addSource(sourceId, { type: 'geojson', data: feature })

  // 2026-05-08: Google-Navi-Blau mit Glow-Halo. Die alte Navy-Linie war auf
  // dem dark Standard-Tile-Style kaum vom Asphalt zu unterscheiden.
  // 3-Layer-Sandwich: Glow (blur, 20px) → Casing (weiß, 12px) → Line (cyan-
  // blau, 7px). Ergibt den GMaps-Look „leuchtende Linie auf der Straße".
  const lineColor = variant === 'active-green' ? '#16A34A' : '#1A73E8' // emerald-600 / google-navi-blue
  const glowColor = variant === 'active-green' ? '#34D399' : '#4285F4' // emerald-400 / google-navi-blue-soft

  map.addLayer({
    id: glowId,
    type: 'line',
    source: sourceId,
    slot: ROUTE_SLOT,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': glowColor,
      'line-width': 20,
      'line-opacity': 0.35,
      'line-blur': 6,
    },
  } as Parameters<typeof map.addLayer>[0])
  map.addLayer({
    id: casingId,
    type: 'line',
    source: sourceId,
    slot: ROUTE_SLOT,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 12,
      'line-opacity': 0.95,
    },
  } as Parameters<typeof map.addLayer>[0])
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    slot: ROUTE_SLOT,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': lineColor,
      'line-width': 7,
    },
  } as Parameters<typeof map.addLayer>[0])
}

export function removeRouteLayer(map: MapboxMap, variant: Variant = 'main'): void {
  const sourceId = SOURCES[variant]
  for (const id of [LINE_LAYERS[variant], CASING_LAYERS[variant], GLOW_LAYERS[variant]]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}
