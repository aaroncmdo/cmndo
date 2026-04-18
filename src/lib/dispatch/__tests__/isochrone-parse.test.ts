// AAR-521: Unit-Tests fuer parseIsochrone — Format A, B, C und Invalid.

import { describe, it, expect } from 'vitest'
import { parseIsochrone } from '../isochrone-parse'

describe('parseIsochrone', () => {
  it('normalisiert Format A ({lat,lng}[]) zu [lng,lat][]', () => {
    const raw = [
      { lat: 50.9, lng: 6.9 },
      { lat: 50.95, lng: 6.95 },
      { lat: 51.0, lng: 7.0 },
      { lat: 50.9, lng: 6.9 },
    ]
    const result = parseIsochrone(raw)
    expect(result).not.toBeNull()
    expect(result).toEqual([
      [6.9, 50.9],
      [6.95, 50.95],
      [7.0, 51.0],
      [6.9, 50.9],
    ])
  })

  it('normalisiert Format B (GeoJSON coordinates[0]) zu [lng,lat][]', () => {
    const raw = {
      coordinates: [
        [
          [6.9, 50.9],
          [6.95, 50.95],
          [7.0, 51.0],
          [6.9, 50.9],
        ],
      ],
    }
    const result = parseIsochrone(raw)
    expect(result).toEqual([
      [6.9, 50.9],
      [6.95, 50.95],
      [7.0, 51.0],
      [6.9, 50.9],
    ])
  })

  it('normalisiert Format C (flat coordinates) zu [lng,lat][]', () => {
    const raw = {
      coordinates: [
        [6.9, 50.9],
        [6.95, 50.95],
        [7.0, 51.0],
        [6.9, 50.9],
      ],
    }
    const result = parseIsochrone(raw)
    expect(result).toEqual([
      [6.9, 50.9],
      [6.95, 50.95],
      [7.0, 51.0],
      [6.9, 50.9],
    ])
  })

  it('gibt null zurueck bei null / undefined / leerem Input', () => {
    expect(parseIsochrone(null)).toBeNull()
    expect(parseIsochrone(undefined)).toBeNull()
    expect(parseIsochrone([])).toBeNull()
    expect(parseIsochrone({})).toBeNull()
    expect(parseIsochrone({ coordinates: [] })).toBeNull()
  })

  it('gibt null zurueck bei unbekannten Formaten', () => {
    expect(parseIsochrone('irgendein-string')).toBeNull()
    expect(parseIsochrone(42)).toBeNull()
    expect(parseIsochrone({ foo: 'bar' })).toBeNull()
    expect(parseIsochrone([{ foo: 'bar' }])).toBeNull()
  })

  it('gibt null zurueck wenn Polygon < 3 Punkte hat', () => {
    expect(parseIsochrone([{ lat: 1, lng: 2 }])).toBeNull()
    expect(
      parseIsochrone([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]),
    ).toBeNull()
  })

  it('filtert kaputte Punkte in Format A (nicht-numerisch)', () => {
    const raw = [
      { lat: 50.9, lng: 6.9 },
      { lat: 'nope', lng: 6.95 },
      { lat: 51.0, lng: 7.0 },
      { lat: 50.9, lng: 6.9 },
    ]
    const result = parseIsochrone(raw)
    expect(result).toHaveLength(3)
  })
})
