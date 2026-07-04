import { describe, it, expect } from 'vitest'
import type { SvLiveOps, TerminPin, DeadPin } from '@/lib/live-ops'
import { svPinsFC, terminPinsFC, deadPinsFC, isochroneFC } from './geo'

// --- Fixtures ---

const makeSv = (overrides: Partial<SvLiveOps> = {}): SvLiveOps => ({
  id: 'sv-1',
  name: 'Hans Muster',
  typ: 'kfz',
  verifiziert: true,
  paket: 'pro',
  genutzt: 2,
  gesamt: 10,
  gesperrt: false,
  urlaub: false,
  standortLat: 52.52,
  standortLng: 13.405,
  isochrone: null,
  car: {
    mode: 'none',
    lat: null,
    lng: null,
    heading: null,
    zielLat: null,
    zielLng: null,
    terminId: null,
    etaMinuten: null,
  },
  ...overrides,
})

const makeTermin = (overrides: Partial<TerminPin> = {}): TerminPin => ({
  id: 't-1',
  svId: 'sv-1',
  svName: 'Hans Muster',
  kundeName: 'Max Kunde',
  status: 'bestaetigt',
  startZeit: '2026-07-04T09:00:00Z',
  lat: 48.137,
  lng: 11.576,
  adresse: 'Musterstr. 1, 80331 Muenchen',
  claimNummer: 'CLM-2026-00001',
  ...overrides,
})

const makeDeadPin = (overrides: Partial<DeadPin> = {}): DeadPin => ({
  id: 'd-1',
  name: 'Peter Gutachter',
  firma: 'Gutachter GmbH',
  status: 'kalt',
  lat: 51.5,
  lng: 7.0,
  region: 'NRW',
  quelle: 'dat',
  ...overrides,
})

const POLYGON: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [13.0, 52.0],
      [14.0, 52.0],
      [14.0, 53.0],
      [13.0, 53.0],
      [13.0, 52.0],
    ],
  ],
}

// --- svPinsFC ---

describe('svPinsFC', () => {
  it('returns a FeatureCollection', () => {
    const fc = svPinsFC([makeSv()])
    expect(fc.type).toBe('FeatureCollection')
  })

  it('maps one SV with standortLat/Lng to one Point feature', () => {
    const sv = makeSv()
    const fc = svPinsFC([sv])
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.type).toBe('Feature')
    expect(f.geometry.type).toBe('Point')
    const coords = (f.geometry as GeoJSON.Point).coordinates
    // lng first!
    expect(coords[0]).toBe(sv.standortLng)
    expect(coords[1]).toBe(sv.standortLat)
  })

  it('sets __id, __type and typ on properties', () => {
    const sv = makeSv({ id: 'sv-99', typ: 'kfz' })
    const f = svPinsFC([sv]).features[0]
    expect(f.properties?.__id).toBe('sv-99')
    expect(f.properties?.__type).toBe('sv')
    expect(f.properties?.typ).toBe('kfz')
  })

  it('drops SVs with null standortLat or standortLng', () => {
    const noLat = makeSv({ standortLat: null, standortLng: 13.0 })
    const noLng = makeSv({ standortLat: 52.0, standortLng: null })
    const both = makeSv({ standortLat: null, standortLng: null })
    expect(svPinsFC([noLat]).features).toHaveLength(0)
    expect(svPinsFC([noLng]).features).toHaveLength(0)
    expect(svPinsFC([both]).features).toHaveLength(0)
  })

  it('returns empty FC for empty array', () => {
    expect(svPinsFC([]).features).toHaveLength(0)
  })
})

// --- terminPinsFC ---

describe('terminPinsFC', () => {
  it('maps one Termin to one Point feature with lng-first coords', () => {
    const t = makeTermin()
    const fc = terminPinsFC([t])
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    const coords = (f.geometry as GeoJSON.Point).coordinates
    expect(coords[0]).toBe(t.lng)
    expect(coords[1]).toBe(t.lat)
  })

  it('sets __id, __type and status on properties', () => {
    const t = makeTermin({ id: 't-42', status: 'vorgeschlagen' })
    const f = terminPinsFC([t]).features[0]
    expect(f.properties?.__id).toBe('t-42')
    expect(f.properties?.__type).toBe('termin')
    expect(f.properties?.status).toBe('vorgeschlagen')
  })
})

// --- deadPinsFC ---

describe('deadPinsFC', () => {
  it('maps one DeadPin to one Point feature', () => {
    const dp = makeDeadPin()
    const fc = deadPinsFC([dp])
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    const coords = (f.geometry as GeoJSON.Point).coordinates
    expect(coords[0]).toBe(dp.lng)
    expect(coords[1]).toBe(dp.lat)
  })

  it('sets __id, __type, status and quelle on properties', () => {
    const dp = makeDeadPin({ id: 'dp-7', status: 'warm', quelle: 'manual' })
    const f = deadPinsFC([dp]).features[0]
    expect(f.properties?.__id).toBe('dp-7')
    expect(f.properties?.__type).toBe('deadpin')
    expect(f.properties?.status).toBe('warm')
    expect(f.properties?.quelle).toBe('manual')
  })
})

// --- isochroneFC ---

describe('isochroneFC', () => {
  it('returns Polygon feature for SV with isochrone', () => {
    const sv = makeSv({ isochrone: POLYGON })
    const fc = isochroneFC([sv])
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry.type).toBe('Polygon')
    expect(f.properties?.__id).toBe(sv.id)
    expect(f.properties?.__type).toBe('isochrone')
  })

  it('drops SVs without isochrone', () => {
    const sv = makeSv({ isochrone: null })
    expect(isochroneFC([sv]).features).toHaveLength(0)
  })

  it('handles mix of with and without isochrone', () => {
    const svWith = makeSv({ id: 'sv-a', isochrone: POLYGON })
    const svWithout = makeSv({ id: 'sv-b', isochrone: null })
    const fc = isochroneFC([svWith, svWithout])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties?.__id).toBe('sv-a')
  })
})
