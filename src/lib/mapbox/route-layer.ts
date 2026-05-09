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
import type { MapboxLightPreset } from './light-preset'

type Variant = 'main' | 'active-green'

// 2026-05-08 (C5): Route-Farben adaptieren sich an das Light-Preset des
// Mapbox-Standard-Styles. Auf hellem `day`-Style war die alte Google-Navi-
// Blau-Linie (#1A73E8) gegen weiße Buildings nur subtil sichtbar — Aaron-
// Smoke #5 zeigte Phase 04 mit fast unsichtbarer Route-Linie. Bei dunklen
// Presets bleibt der leuchtende Look, bei hellen wechseln wir auf
// dunkle Töne mit weißem Casing für maximalen Kontrast.
type RouteTheme = {
  /** Inner-Line-Color für 'low'/'unknown' congestion. */
  baseLine: string
  /** Glow-Halo-Color (außen, blurred). */
  glow: string
  /** Casing-Color zwischen Glow und Line. */
  casing: string
  /** Glow-Opacity — auf hellem Hintergrund weniger weil sonst Wash-out. */
  glowOpacity: number
}

function themeForPreset(preset: MapboxLightPreset, isGreen: boolean): RouteTheme {
  // Active-Green-Variante (Tagesroute-Highlight) bleibt themen-unabhängig
  // weil sie den semantischen "aktive Route"-Akzent setzt — nicht zur
  // Tageszeit gehört.
  if (isGreen) {
    return { baseLine: '#16A34A', glow: '#34D399', casing: '#FFFFFF', glowOpacity: 0.35 }
  }
  switch (preset) {
    case 'day':
      // Tagslicht: dunkle Navi-Linie auf weißen Tiles, dezenter Glow.
      // Casing bleibt weiß — die "Highlight-Strasse"-Optik ist universell.
      return { baseLine: '#0D47A1', glow: '#1976D2', casing: '#FFFFFF', glowOpacity: 0.22 }
    case 'dawn':
      // Morgendämmerung: medium-blue, etwas warm.
      return { baseLine: '#1565C0', glow: '#42A5F5', casing: '#FFFFFF', glowOpacity: 0.28 }
    case 'dusk':
    case 'night':
    default:
      // Dusk/Night: leuchtende Google-Navi-Töne, intensiver Glow.
      return { baseLine: '#1A73E8', glow: '#4285F4', casing: '#FFFFFF', glowOpacity: 0.4 }
  }
}

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
// `middle` = über Roads aber unter Labels und Buildings, `bottom` = unter Roads.
//
// Aaron-Smoke 2026-05-08: mit slot='top' lief die Navi-Linie durch die
// 3D-Gebäude DURCH (sie wurde immer im Vordergrund gerendert, auch wo
// ein Building sie eigentlich verdecken sollte). Bei einer Strasse die
// hinter einem Hochhaus liegt sah man trotzdem die blaue Linie quer
// durch das Building.
// Lösung: slot='middle' → Route liegt zwischen Roads und Buildings.
// Roads sind sichtbar wo sie offen sind, Buildings verdecken die Route
// realistic dort wo sie das räumlich tun. Labels (Strassennamen, POIs)
// bleiben über der Route — gut so, sonst verdeckt der dicke Glow die
// Beschriftung.
const ROUTE_SLOT = 'middle' as const

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
 *
 * 2026-05-08 (C5): optionaler `lightPreset` für Theme-Adaption — wenn
 * nicht gesetzt, fällt es auf 'night' (intensiver Glow) zurück.
 */
export function upsertRouteLayer(
  map: MapboxMap,
  coords: Array<[number, number]>,
  variant: Variant = 'main',
  lightPreset: MapboxLightPreset = 'night',
): void {
  upsertRouteLayerCore(map, airlineFeatures(coords), variant, lightPreset)
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
  lightPreset: MapboxLightPreset = 'night',
): void {
  const features = routeToCongestionFeatures(route)
  upsertRouteLayerCore(map, features.length ? features : airlineFeatures(route.coords), variant, lightPreset)
}

function upsertRouteLayerCore(
  map: MapboxMap,
  features: GeoJSON.Feature[],
  variant: Variant,
  lightPreset: MapboxLightPreset,
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
  // Stau-Bereichen). Theme adaptiert sich an Light-Preset: dark line auf
  // Tag, bright glow auf Nacht.
  const isGreen = variant === 'active-green'
  const theme = themeForPreset(lightPreset, isGreen)
  const lineColorExpr = [
    'match',
    ['get', 'congestion'],
    'severe', '#DC2626',  // red-600 — kritisch, immer rot egal welches Theme
    'heavy', '#F97316',   // orange-500
    'moderate', '#F59E0B', // amber-500
    theme.baseLine,        // default low/unknown — themen-abhängig
  ]

  map.addLayer({
    id: glowId,
    type: 'line',
    source: sourceId,
    slot: ROUTE_SLOT,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': theme.glow,
      'line-width': 20,
      'line-opacity': theme.glowOpacity,
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
      'line-color': theme.casing,
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
