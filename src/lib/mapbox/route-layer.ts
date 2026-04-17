'use client'

// AAR-380: Route-Polyline als Mapbox Source + Layer.
//
// Nimmt eine Liste von [lng, lat]-Punkten oder eine GeoJSON-LineString-
// Geometry und rendert sie mit Navy-Linie + Glow-Effekt (breiter, blass).

import type { Map as MapboxMap } from 'mapbox-gl'

export interface RouteLayerIds {
  sourceId: string
  lineLayerId: string
  glowLayerId: string
}

const DEFAULT_IDS: RouteLayerIds = {
  sourceId: 'field-route',
  lineLayerId: 'field-route-line',
  glowLayerId: 'field-route-glow',
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

/**
 * Fügt Route-Source+Layer zur Karte hinzu. Idempotent — bei wiederholtem
 * Call werden nur die Koordinaten aktualisiert.
 */
export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  ids: RouteLayerIds = DEFAULT_IDS,
): void {
  const feature = toGeoJson(coords)
  const existingSource = map.getSource(ids.sourceId) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(feature as GeoJSON.Feature)
    return
  }

  map.addSource(ids.sourceId, { type: 'geojson', data: feature })

  // Glow (breiter, transparenter) — muss UNTER der Hauptlinie liegen
  map.addLayer({
    id: ids.glowLayerId,
    type: 'line',
    source: ids.sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#4573A2',
      'line-width': 14,
      'line-opacity': 0.25,
      'line-blur': 4,
    },
  })

  map.addLayer({
    id: ids.lineLayerId,
    type: 'line',
    source: ids.sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#0D1B3E',
      'line-width': 6,
    },
  })
}

/** Entfernt Source + Layer wieder. Idempotent. */
export function removeRouteLayer(
  map: MapboxMap,
  ids: RouteLayerIds = DEFAULT_IDS,
): void {
  if (map.getLayer(ids.lineLayerId)) map.removeLayer(ids.lineLayerId)
  if (map.getLayer(ids.glowLayerId)) map.removeLayer(ids.glowLayerId)
  if (map.getSource(ids.sourceId)) map.removeSource(ids.sourceId)
}
