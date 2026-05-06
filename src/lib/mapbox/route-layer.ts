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
