'use client'

// Route-Polyline Helpers — zwei separate Layer-Sets:
//   'main' (default) — solid claimondo-navy. Wird genutzt wenn keine
//      Verlegung vorliegt (Single-Route-Use-Case).
//   'active-green' — solid grün. Die NEUE Route nach Verlegung.
//   'original-dashed' — dashed slate. Die URSPRÜNGLICHE Route durch
//      alle Stops inkl. verlegte (Vergleichs-Visualisierung).

import type { Map as MapboxMap } from 'mapbox-gl'

type Variant = 'main' | 'active-green' | 'original-dashed'

const SOURCES: Record<Variant, string> = {
  'main': 'route-main',
  'active-green': 'route-active-green',
  'original-dashed': 'route-original-dashed',
}

const LINE_LAYERS: Record<Variant, string> = {
  'main': 'route-main-line',
  'active-green': 'route-active-green-line',
  'original-dashed': 'route-original-dashed-line',
}

const CASING_LAYERS: Record<Variant, string> = {
  'main': 'route-main-casing',
  'active-green': 'route-active-green-casing',
  'original-dashed': 'route-original-dashed-casing',
}

function toGeoJson(coords: Array<[number, number]>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
}

export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  variant: Variant = 'main',
): void {
  const sourceId = SOURCES[variant]
  const lineId = LINE_LAYERS[variant]
  const casingId = CASING_LAYERS[variant]

  const feature = toGeoJson(coords)
  const existingSource = map.getSource(sourceId) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(feature as GeoJSON.Feature)
    return
  }

  map.addSource(sourceId, { type: 'geojson', data: feature })

  if (variant === 'original-dashed') {
    // Dashed slate — die Original-Route, dezent als Vergleich
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': '#64748B', // slate-500
        'line-width': 4,
        'line-opacity': 0.7,
        'line-dasharray': [3, 2],
      },
    })
    return
  }

  // 'main' (claimondo-blau) und 'active-green' bekommen White-Casing +
  // Solid-Linie für maximalen Kontrast.
  const lineColor = variant === 'active-green' ? '#16A34A' : '#0D1B3E' // emerald-600 / claimondo-navy

  map.addLayer({
    id: casingId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 8,
      'line-opacity': 0.95,
    },
  })
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': lineColor,
      'line-width': 5,
    },
  })
}

export function removeRouteLayer(map: MapboxMap, variant: Variant = 'main'): void {
  const sourceId = SOURCES[variant]
  for (const id of [LINE_LAYERS[variant], CASING_LAYERS[variant]]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}
