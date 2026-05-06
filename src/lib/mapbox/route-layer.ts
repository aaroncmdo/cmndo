'use client'

// AAR-380: Route-Polyline als Mapbox Source + Layer.
// 2026-05-06: Variant-Support — `primary` (gold-solid Active-Route)
// und `secondary` (dashed gray Verlegt-Stub).

import type { Map as MapboxMap } from 'mapbox-gl'

export interface RouteLayerIds {
  sourceId: string
  lineLayerId: string
  glowLayerId: string
}

const PRIMARY_IDS: RouteLayerIds = {
  sourceId: 'field-route',
  lineLayerId: 'field-route-line',
  glowLayerId: 'field-route-glow',
}

const SECONDARY_IDS: RouteLayerIds = {
  sourceId: 'field-route-secondary',
  lineLayerId: 'field-route-secondary-line',
  glowLayerId: 'field-route-secondary-glow',
}

function toGeoJson(coords: Array<[number, number]>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  }
}

export type RouteVariant = 'primary' | 'secondary'

/**
 * Fügt Route-Source+Layer zur Karte hinzu. Idempotent — bei wiederholtem
 * Call werden nur die Koordinaten aktualisiert.
 *
 * Variants:
 *   - 'primary' (default): gold solid — die echte Active-Route
 *   - 'secondary': dashed gray — Stub-Linien zu verlegten/inaktiven Stops
 */
export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  variant: RouteVariant = 'primary',
): void {
  const ids = variant === 'primary' ? PRIMARY_IDS : SECONDARY_IDS
  const feature = toGeoJson(coords)
  const existingSource = map.getSource(ids.sourceId) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(feature as GeoJSON.Feature)
    return
  }

  if (variant === 'primary') {
    // Outer Glow — warmes Goldton-Halo
    map.addLayer({
      id: `${ids.glowLayerId}-outer`,
      type: 'line',
      source: ids.sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#D4AF37',
        'line-width': 22,
        'line-opacity': 0.18,
        'line-blur': 8,
      },
    })
    // Inner Glow
    map.addLayer({
      id: ids.glowLayerId,
      type: 'line',
      source: ids.sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#E5C158',
        'line-width': 12,
        'line-opacity': 0.45,
        'line-blur': 3,
      },
    })
    // White-Casing
    map.addLayer({
      id: `${ids.lineLayerId}-casing`,
      type: 'line',
      source: ids.sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 8,
        'line-opacity': 0.95,
      },
    })
    // Hauptlinie — gold solid
    map.addLayer({
      id: ids.lineLayerId,
      type: 'line',
      source: ids.sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#D4AF37',
        'line-width': 5,
      },
    })
  } else {
    // Secondary — dashed gray Stub-Linie. Dezent, kein Glow, signalisiert
    // „dieser Stop ist nicht in der Route, aber existiert noch".
    map.addLayer({
      id: ids.lineLayerId,
      type: 'line',
      source: ids.sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': '#94A3B8', // slate-400
        'line-width': 3,
        'line-opacity': 0.7,
        'line-dasharray': [3, 2],
      },
    })
  }
}

/** Entfernt Source + Layer wieder. Idempotent. */
export function removeRouteLayer(
  map: MapboxMap,
  variant: RouteVariant = 'primary',
): void {
  const ids = variant === 'primary' ? PRIMARY_IDS : SECONDARY_IDS
  const layers = [
    ids.lineLayerId,
    `${ids.lineLayerId}-casing`,
    ids.glowLayerId,
    `${ids.glowLayerId}-outer`,
  ]
  for (const id of layers) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(ids.sourceId)) map.removeSource(ids.sourceId)
}
