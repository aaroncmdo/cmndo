'use client'

// Route-Polyline Helpers — eine Variante pro Use-Case:
//   'main' (default) — solid claimondo-navy. Default Tagesroute.
//   'active-green' — solid grün. Reserviert für Live-Modus / Fokus.
//
// 2026-05-08 PR B: Die Linie wird jetzt pro Segment nach Stau-Status
// (`congestion`-Annotation aus Mapbox-Directions) eingefärbt — wie GMaps:
//   low      → blau (#1A73E8, default)
//   moderate → amber (#F59E0B)
//   heavy    → orange (#F97316)
//   severe   → rot (#DC2626)
//   unknown  → blau wie low (Mapbox liefert das auf Nebenstraßen)
// Glow + Casing bleiben einfarbig — sonst flackert der Look. Die obere
// Line nutzt eine match-Expression auf properties.congestion.

import type { Map as MapboxMap } from 'mapbox-gl'
import type { TrafficRoute } from './directions'
import { routeToCongestionFeatures } from './directions'

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

// 2026-05-08: Mapbox Standard Style hat einen `slot`-Mechanismus statt der
// klassischen layer-Reihenfolge. `top` = über allen Buildings + Labels,
// `middle` = über Roads aber unter Labels, `bottom` = unter Roads.
// Für eine Navi-Linie wollen wir `top` damit auch 3D-Buildings (die im
// Standard-Style einen eigenen Slot haben) die Linie nicht überdecken.
const ROUTE_SLOT = 'top' as const

function toFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

function airlineFeatures(coords: Array<[number, number]>): GeoJSON.Feature[] {
  return [
    {
      type: 'Feature',
      properties: { congestion: 'unknown' },
      geometry: { type: 'LineString', coordinates: coords },
    },
  ]
}

/**
 * Variante 1 (LEGACY): Plain-Coords-Polyline. Wird noch von der
 * Tagesroute auf /gutachter/heute genutzt (keine Traffic-Annotations
 * dort). Erzeugt eine Single-Feature-Collection mit congestion='unknown'.
 */
export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  variant: Variant = 'main',
): void {
  upsertRouteLayerCore(map, airlineFeatures(coords), variant)
}

/**
 * Variante 2 (NEU PR B): TrafficRoute mit congestion-Annotations →
 * Multi-Feature-Collection mit segment-weiser Färbung. Verwendet im
 * Feldmodus für den Echtzeit-Stau-Look.
 */
export function upsertTrafficRouteLayer(
  map: MapboxMap,
  route: TrafficRoute,
  variant: Variant = 'main',
): void {
  const features = routeToCongestionFeatures(route)
  upsertRouteLayerCore(map, features.length ? features : airlineFeatures(route.coords), variant)
}

function upsertRouteLayerCore(
  map: MapboxMap,
  features: GeoJSON.Feature[],
  variant: Variant,
): void {
  const sourceId = SOURCES[variant]
  const lineId = LINE_LAYERS[variant]
  const casingId = CASING_LAYERS[variant]
  const glowId = GLOW_LAYERS[variant]

  const fc = toFeatureCollection(features)
  const existingSource = map.getSource(sourceId) as
    | mapboxgl.GeoJSONSource
    | undefined

  if (existingSource) {
    existingSource.setData(fc)
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

  map.addSource(sourceId, { type: 'geojson', data: fc })

  // 2026-05-08: Google-Navi-Look mit congestion-Coloring auf der Top-Line.
  // Glow + Casing bleiben einfarbig (sonst flackert der Look in farbigen
  // Stau-Bereichen). Default ist `low`/`unknown` = blau.
  const isGreen = variant === 'active-green'
  const lineColorExpr = [
    'match',
    ['get', 'congestion'],
    'severe', '#DC2626',  // red-600
    'heavy', '#F97316',   // orange-500
    'moderate', '#F59E0B', // amber-500
    isGreen ? '#16A34A' : '#1A73E8', // default low/unknown
  ]
  const glowColor = isGreen ? '#34D399' : '#4285F4' // emerald-400 / google-navi-blue-soft

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
      'line-color': lineColorExpr,
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
