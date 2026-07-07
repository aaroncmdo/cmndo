import { describe, it, expect } from 'vitest'
import { baueWerkstattKartenUrl } from '../static-map-url'

const TOKEN = 'pk.test123'
const ISO = { type: 'Polygon', coordinates: [[[7.0, 51.5], [7.1, 51.5], [7.1, 51.6], [7.0, 51.5]]] }

function overlayFeatures(url: string): unknown[] {
  const m = url.match(/static\/geojson\((.*?)\)\/auto/)
  if (!m) return []
  return (JSON.parse(decodeURIComponent(m[1])) as { features: unknown[] }).features
}

describe('baueWerkstattKartenUrl', () => {
  it('ohne Token -> null', () => {
    expect(baueWerkstattKartenUrl({ lat: 51.5, lng: 7.0, isochrone: ISO, token: undefined })).toBeNull()
  })
  it('nicht-finite Koordinaten -> null', () => {
    expect(baueWerkstattKartenUrl({ lat: NaN, lng: 7.0, isochrone: ISO, token: TOKEN })).toBeNull()
  })
  it('mit Isochrone -> URL enthält Token + 2 Features (Polygon + Point)', () => {
    const url = baueWerkstattKartenUrl({ lat: 51.5, lng: 7.0, isochrone: ISO, token: TOKEN })!
    expect(url).toContain('api.mapbox.com/styles/v1/mapbox/streets')
    expect(url).toContain(`access_token=${TOKEN}`)
    const f = overlayFeatures(url) as { geometry: { type: string } }[]
    expect(f).toHaveLength(2)
    expect(f[0].geometry.type).toBe('Polygon')
    expect(f[1].geometry.type).toBe('Point')
  })
  it('ohne Isochrone -> nur der Marker (Point)', () => {
    const url = baueWerkstattKartenUrl({ lat: 51.5, lng: 7.0, isochrone: null, token: TOKEN })!
    const f = overlayFeatures(url) as { geometry: { type: string } }[]
    expect(f).toHaveLength(1)
    expect(f[0].geometry.type).toBe('Point')
    expect(f[0].geometry).toMatchObject({ coordinates: [7.0, 51.5] })
  })
})
