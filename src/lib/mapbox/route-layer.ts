'use client'

// Route-Polyline als Mapbox Source + Layer.
// 2026-05-06: Gold-solid (kein dashed mehr, kein Variant-System).
// Active-Route geht NUR durch nicht-verlegte Stops; verlegte Stops
// werden visuell durch graue Marker dargestellt — keine Stub-Linie
// nötig (war zu komplex und brach das Rendering).

import type { Map as MapboxMap } from 'mapbox-gl'

const SOURCE_ID = 'field-route'
const LINE_LAYER_ID = 'field-route-line'
const GLOW_LAYER_ID = 'field-route-glow'

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
): void {
  const feature = toGeoJson(coords)
  const existingSource = map.getSource(SOURCE_ID) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(feature as GeoJSON.Feature)
    return
  }

  map.addSource(SOURCE_ID, { type: 'geojson', data: feature })

  // Gold-Halo (warm, breit, semi-transparent)
  map.addLayer({
    id: `${GLOW_LAYER_ID}-outer`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#D4AF37',
      'line-width': 22,
      'line-opacity': 0.18,
      'line-blur': 8,
    },
  })
  map.addLayer({
    id: GLOW_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#E5C158',
      'line-width': 12,
      'line-opacity': 0.45,
      'line-blur': 3,
    },
  })
  map.addLayer({
    id: `${LINE_LAYER_ID}-casing`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 8,
      'line-opacity': 0.95,
    },
  })
  // Hauptlinie — gold solid
  map.addLayer({
    id: LINE_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#D4AF37',
      'line-width': 5,
    },
  })
}

export function removeRouteLayer(map: MapboxMap): void {
  for (const id of [
    LINE_LAYER_ID,
    `${LINE_LAYER_ID}-casing`,
    GLOW_LAYER_ID,
    `${GLOW_LAYER_ID}-outer`,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}
