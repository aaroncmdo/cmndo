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

  // Outer Glow (breit, sehr transparent) — Halo-Effekt
  map.addLayer({
    id: `${ids.glowLayerId}-outer`,
    type: 'line',
    source: ids.sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#4573A2',
      'line-width': 22,
      'line-opacity': 0.15,
      'line-blur': 8,
    },
  })

  // Inner Glow (mittlerer Glow) — kräftigerer Halo
  map.addLayer({
    id: ids.glowLayerId,
    type: 'line',
    source: ids.sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#7BA3CC',
      'line-width': 12,
      'line-opacity': 0.45,
      'line-blur': 3,
    },
  })

  // White-Casing unter der Hauptlinie — gibt Tiefe (sieht wie iOS Maps aus)
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

  // Hauptlinie — kräftiges Navy, gestrichelt (2026-05-06: dashed-Style
  // signalisiert dass die Route bei Verlegungen neu berechnet wird —
  // visuell leichter als solide Linie, weniger „starr").
  // line-dasharray nimmt zwei Floats: [dash-length, gap-length] in
  // line-width-Multiplikatoren. [3, 2] = 3 LineWidths Strich, 2
  // LineWidths Lücke. line-cap MUSS 'butt' sein damit Dashes nicht
  // ineinander gerundet werden.
  map.addLayer({
    id: ids.lineLayerId,
    type: 'line',
    source: ids.sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': '#0D1B3E',
      'line-width': 5,
      'line-dasharray': [3, 2],
    },
  })
}

/** Entfernt Source + Layer wieder. Idempotent. */
export function removeRouteLayer(
  map: MapboxMap,
  ids: RouteLayerIds = DEFAULT_IDS,
): void {
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
