// TDD: Tests written BEFORE implementation — will be red until union-isochrones.ts exists.
// Deckt die Kernfaelle ab (Task 1 Spec):
//   1. Zwei ueberlappende Quadrate -> EIN Feature, innere Kante weg (Vertices-Check)
//   2. Zwei disjunkte Quadrate -> MultiPolygon mit 2 Teilen
//   3. parseIsochrone-Format A ({lat,lng}[]) wird akzeptiert
//   4. parseIsochrone-Format B ({coordinates:[[[lng,lat]...]]} ) wird akzeptiert
//   5. Leere Liste -> null
//   6. Nur ungueltige Inputs -> null
//   7. Einzelner gueltiger Input -> gibt dieses Polygon-Feature zurueck

import { describe, it, expect } from 'vitest'
import { unionIsochrones } from './union-isochrones'

// Hilfsfunktion: baut ein Quadrat als Format-A-Array ({lat, lng}[])
// Quadrat als geschlossener Ring [SW, NW, NE, SE, SW] in lat/lng-Notation
function squareFormatA(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): { lat: number; lng: number }[] {
  return [
    { lat: minLat, lng: minLng },
    { lat: maxLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
    { lat: minLat, lng: maxLng },
    { lat: minLat, lng: minLng }, // geschlossen
  ]
}

// Hilfsfunktion: baut ein Quadrat als Format-B-Objekt ({coordinates:[[[lng,lat]...]]})
function squareFormatB(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): { coordinates: [number, number][][] } {
  return {
    coordinates: [
      [
        [minLng, minLat],
        [minLng, maxLat],
        [maxLng, maxLat],
        [maxLng, minLat],
        [minLng, minLat], // geschlossen
      ],
    ],
  }
}

describe('unionIsochrones', () => {
  it('gibt null zurueck bei leerer Liste', () => {
    expect(unionIsochrones([])).toBeNull()
  })

  it('gibt null zurueck bei nur ungueltigen Inputs', () => {
    expect(unionIsochrones([null, undefined, 'kein-polygon', 42, {}])).toBeNull()
  })

  it('gibt null zurueck bei einem Input mit zu wenig Punkten (<3)', () => {
    // Nur 2 Punkte -> parseIsochrone liefert null -> 0 gueltige -> null
    const tooFew = { coordinates: [[[8.0, 48.0], [8.5, 48.5]]] }
    expect(unionIsochrones([tooFew])).toBeNull()
  })

  it('gibt ein einzelnes Polygon-Feature zurueck bei einem gueltigen Input', () => {
    const single = squareFormatA(8.0, 48.0, 8.5, 48.5)
    const result = unionIsochrones([single])
    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')
    expect(['Polygon', 'MultiPolygon']).toContain(result!.geometry.type)
  })

  it('Format A ({lat,lng}[]) wird korrekt akzeptiert', () => {
    const formatA = squareFormatA(8.0, 48.0, 8.5, 48.5)
    const result = unionIsochrones([formatA])
    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')
  })

  it('Format B ({coordinates:[[[lng,lat]...]]}) wird korrekt akzeptiert', () => {
    const formatB = squareFormatB(8.0, 48.0, 8.5, 48.5)
    const result = unionIsochrones([formatB])
    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')
  })

  it('zwei ueberlappende Quadrate werden zu EINEM Feature vereint (Vertices-Count < Summe)', () => {
    // Quadrat 1: [0,0] bis [2,2] — Quadrat 2: [1,0] bis [3,2] — Ueberlappung: x=1..2
    // Jedes Quadrat hat 5 Vertices (Ring geschlossen). Die Vereinigung hat weniger
    // als 10 Vertices, weil die innere Kante (x=1 und x=2 teilweise) wegfaellt.
    const sq1 = squareFormatA(0, 0, 2, 2)
    const sq2 = squareFormatA(1, 0, 3, 2)
    const result = unionIsochrones([sq1, sq2])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')

    // Union muss ein einzelnes Polygon sein (nicht MultiPolygon), da die Quadrate ueberlappen
    expect(result!.geometry.type).toBe('Polygon')

    // Vertex-Count-Check: Union-Ring hat weniger Vertices als Summe (5+5=10)
    const poly = result!.geometry as GeoJSON.Polygon
    const ringVertexCount = poly.coordinates[0].length
    expect(ringVertexCount).toBeLessThan(10)
    // Union eines L-/rechteckigen Verbunds: mindestens 5 Vertices (kein degeniertes Ergebnis)
    expect(ringVertexCount).toBeGreaterThanOrEqual(5)
  })

  it('zwei disjunkte Quadrate ergeben MultiPolygon mit 2 Teilen', () => {
    // Quadrat 1: [0,0] bis [1,1] — Quadrat 2: [5,0] bis [6,1] — kein Beruehren
    const sq1 = squareFormatA(0, 0, 1, 1)
    const sq2 = squareFormatA(5, 0, 6, 1)
    const result = unionIsochrones([sq1, sq2])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')
    expect(result!.geometry.type).toBe('MultiPolygon')

    const multiPoly = result!.geometry as GeoJSON.MultiPolygon
    expect(multiPoly.coordinates.length).toBe(2)
  })

  it('mischt Format A und Format B korrekt', () => {
    // Ueberlappende Quadrate — eines in Format A, eines in Format B
    const sq1 = squareFormatA(0, 0, 2, 2)
    const sq2 = squareFormatB(1, 0, 3, 2)
    const result = unionIsochrones([sq1, sq2])

    expect(result).not.toBeNull()
    expect(result!.geometry.type).toBe('Polygon')
  })

  it('ignoriert ungueltige Inputs und verarbeitet gueltige weiter', () => {
    const sq1 = squareFormatA(0, 0, 1, 1)
    const sq2 = squareFormatA(5, 0, 6, 1)
    const result = unionIsochrones([null, sq1, undefined, 'invalid', sq2, {}])

    expect(result).not.toBeNull()
    expect(result!.geometry.type).toBe('MultiPolygon')
  })

  it('schliesst einen offenen Ring korrekt (erster != letzter Punkt)', () => {
    // Offener Ring (erster Punkt != letzter) — parseIsochrone liefert [lng,lat][] ohne Schluss
    // Wir simulieren durch direkte Format-B-Eingabe mit offenem Ring
    const openRing: { coordinates: [number, number][][] } = {
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          // kein Schlusspunkt — Implementation muss ihn ergaenzen
        ],
      ],
    }
    const result = unionIsochrones([openRing])
    expect(result).not.toBeNull()
    expect(result!.type).toBe('Feature')
  })
})
