import { describe, it, expect } from 'vitest'
import { kmCircle, pointInRing, pointInAnyPolygon } from './coverage'

describe('kmCircle', () => {
  it('returns a closed Polygon ring with steps+1 vertices', () => {
    const poly = kmCircle(7.0, 51.0, 10, 48)
    expect(poly.type).toBe('Polygon')
    const ring = poly.coordinates[0]
    expect(ring.length).toBe(49) // 48 segments + closing vertex
    expect(ring[0]).toEqual(ring[ring.length - 1]) // closed
  })

  it('center + half-radius inside, double-radius outside (geographic scale)', () => {
    const lng = 7.0
    const lat = 51.0
    const r = 10
    const ring = kmCircle(lng, lat, r, 64).coordinates[0] as [number, number][]
    const dLat = r / 111.32
    expect(pointInRing([lng, lat], ring)).toBe(true) // center
    expect(pointInRing([lng, lat + dLat * 0.5], ring)).toBe(true) // half radius north
    expect(pointInRing([lng, lat + dLat * 2], ring)).toBe(false) // double radius north
  })
})

describe('pointInRing', () => {
  const square: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]
  it('inside', () => expect(pointInRing([5, 5], square)).toBe(true))
  it('outside (right)', () => expect(pointInRing([15, 5], square)).toBe(false))
  it('outside (negative)', () => expect(pointInRing([-5, -5], square)).toBe(false))
})

describe('pointInAnyPolygon', () => {
  const koeln = kmCircle(7.0, 51.0, 15)
  const stuttgart = kmCircle(9.18, 48.78, 15)
  it('inside first polygon', () => expect(pointInAnyPolygon([7.0, 51.0], [koeln, stuttgart])).toBe(true))
  it('inside second polygon', () => expect(pointInAnyPolygon([9.18, 48.78], [koeln, stuttgart])).toBe(true))
  it('outside all (Berlin)', () => expect(pointInAnyPolygon([13.4, 52.52], [koeln, stuttgart])).toBe(false))
  it('empty coverage → false', () => expect(pointInAnyPolygon([7.0, 51.0], [])).toBe(false))
})
