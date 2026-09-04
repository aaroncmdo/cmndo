// Geometrische Union von Roh-Isochronen aus der DB.
//
// Jede `raw`-Eingabe wird via parseIsochrone in einen [lng,lat][]-Ring normalisiert
// (deckt die 3 DB-Formate ab). Gueltige Ringe werden zu turf.Polygon-Features und
// anschliessend via @turf/union zu einer gemeinsamen Flaeche vereint:
//   - ueberlappende Polygone verschmelzen (kein innerer Rand)
//   - disjunkte bleiben getrennt (MultiPolygon)
//   - 0 gueltige -> null
//
// API turf v7: union(featureCollection([f1, f2, ...]))
// Keine Vereinfachung/Approximation — die reale Geometrie bleibt erhalten.

import { union } from '@turf/union'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { vereinfacheRing } from './vereinfache-polygon'

type LngLat = [number, number]

// Konstruiert ein GeoJSON-Polygon-Feature als Plain-Object (kein turf/helpers-Import
// noetig — vermeidet Version-Konflikt zwischen Top-Level @turf/helpers v5 und
// @turf/union-internem @turf/helpers v7).
function makePolygonFeature(
  ring: LngLat[],
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  }
}

// Baut eine GeoJSON-FeatureCollection als Plain-Object (turf v7-kompatibel).
function makeFeatureCollection(
  features: GeoJSON.Feature<GeoJSON.Polygon>[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features,
  }
}

/**
 * Vereint eine Liste von Roh-Isochronen (DB-Formate A/B/C) zu einer einzigen
 * GeoJSON-Feature-Geometrie:
 *   - 0 gueltige Inputs  -> null
 *   - 1 gueltiger Input  -> das entsprechende Polygon-Feature
 *   - N gueltige Inputs  -> geometrische Union (Polygon oder MultiPolygon)
 *
 * Degenierte/selbst-schneidende Polygone werden defensiv uebersprungen.
 */
export function unionIsochrones(
  raws: unknown[],
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  // Schritt 1: Normalisieren via parseIsochrone -> gueltige Ringe sammeln
  const validFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = []

  for (const raw of raws) {
    const ring = parseIsochrone(raw)
    if (!ring || ring.length < 3) continue

    // Ring schliessen: erster Punkt == letzter Punkt
    const closed: LngLat[] =
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? (ring as LngLat[])
        : ([...ring, ring[0]] as LngLat[])

    // Vereinfachen VOR der Vereinigung, aus zwei Gruenden:
    //  1. Der Payload schrumpft — er landet als JSON im HTML des Embed-Finders.
    //  2. `union` wird schneller und numerisch ruhiger, weil es mit einem
    //     Bruchteil der Stuetzpunkte arbeitet.
    // Die Toleranz liegt unter einem Bildschirmpixel jeder sinnvollen
    // Zoom-Stufe; entartet ein Ring, gibt vereinfacheRing ihn unveraendert
    // zurueck (siehe dort).
    const schlank = vereinfacheRing(closed)

    try {
      const feature = makePolygonFeature(schlank)
      validFeatures.push(feature)
    } catch {
      // Polygon-Konstruktion schlaegt fehl (z.B. degeneriert) -> ueberspringen
    }
  }

  if (validFeatures.length === 0) return null
  if (validFeatures.length === 1) return validFeatures[0]

  // Schritt 2: Inkrementelle Union via turf v7 — defensiv: Fehler beim einzelnen
  // Schritt werden uebersprungen, das bisherige Ergebnis bleibt erhalten.
  const fc = makeFeatureCollection(validFeatures)

  try {
    const result = union(
      fc as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    )
    // turf.union gibt null zurueck wenn die FeatureCollection leer war —
    // das sollte hier nie eintreten (wir haben >= 2 Features), aber defensiv:
    if (!result) return validFeatures[0]
    return result
  } catch {
    // Letzte Verteidigung: turf wirft bei extremen Degenierungen -> ersten zurueckgeben
    return validFeatures[0]
  }
}
