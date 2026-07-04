import { describe, it, expect } from 'vitest'
import type { SvLiveOps, TerminPin, DeadPin, UnterwegsRoute, TagesRoute, LeadPin } from '@/lib/live-ops'
import { svPinsFC, terminPinsFC, deadPinsFC, isochroneFC, routenFC, tagesroutenFC, leadsFC } from './geo'

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

const makeRoute = (overrides: Partial<UnterwegsRoute> = {}): UnterwegsRoute => ({
  svId: 'sv-1',
  coords: [
    [13.405, 52.52],
    [13.41, 52.525],
  ],
  ...overrides,
})

const makeTagesRoute = (overrides: Partial<TagesRoute> = {}): TagesRoute => ({
  svId: 'sv-1',
  svName: 'Hans Muster',
  stops: [
    { terminId: 't-1', lat: 52.52, lng: 13.405, startZeit: '2026-07-04T09:00:00Z', reihenfolge: 1 },
    { terminId: 't-2', lat: 52.53, lng: 13.41, startZeit: '2026-07-04T11:00:00Z', reihenfolge: 2 },
  ],
  ...overrides,
})

// --- routenFC ---

describe('routenFC', () => {
  it('maps one UnterwegsRoute to one LineString feature', () => {
    const r = makeRoute()
    const fc = routenFC([r])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry.type).toBe('LineString')
    const coords = (f.geometry as GeoJSON.LineString).coordinates
    expect(coords).toEqual(r.coords)
  })

  it('sets __type and svId on properties', () => {
    const r = makeRoute({ svId: 'sv-42' })
    const f = routenFC([r]).features[0]
    expect(f.properties?.__type).toBe('route')
    expect(f.properties?.svId).toBe('sv-42')
  })

  it('drops routes with fewer than 2 coords', () => {
    const empty = makeRoute({ coords: [] })
    const single = makeRoute({ coords: [[13.0, 52.0]] })
    expect(routenFC([empty]).features).toHaveLength(0)
    expect(routenFC([single]).features).toHaveLength(0)
  })

  it('returns empty FC for empty array', () => {
    expect(routenFC([]).features).toHaveLength(0)
  })
})

// --- tagesroutenFC ---

describe('tagesroutenFC', () => {
  it('maps one TagesRoute with 2 stops to one LineString feature', () => {
    const tr = makeTagesRoute()
    const fc = tagesroutenFC([tr])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry.type).toBe('LineString')
    const coords = (f.geometry as GeoJSON.LineString).coordinates
    // [lng, lat] reihenfolge, sorted by reihenfolge
    expect(coords[0]).toEqual([13.405, 52.52])
    expect(coords[1]).toEqual([13.41, 52.53])
  })

  it('sorts stops by reihenfolge', () => {
    const tr = makeTagesRoute({
      stops: [
        { terminId: 't-2', lat: 52.53, lng: 13.41, startZeit: '2026-07-04T11:00:00Z', reihenfolge: 2 },
        { terminId: 't-1', lat: 52.52, lng: 13.405, startZeit: '2026-07-04T09:00:00Z', reihenfolge: 1 },
      ],
    })
    const f = tagesroutenFC([tr]).features[0]
    const coords = (f.geometry as GeoJSON.LineString).coordinates
    expect(coords[0]).toEqual([13.405, 52.52])
    expect(coords[1]).toEqual([13.41, 52.53])
  })

  it('sets __type, svId and svName on properties', () => {
    const tr = makeTagesRoute({ svId: 'sv-7', svName: 'Maria Gutachterin' })
    const f = tagesroutenFC([tr]).features[0]
    expect(f.properties?.__type).toBe('tagesroute')
    expect(f.properties?.svId).toBe('sv-7')
    expect(f.properties?.svName).toBe('Maria Gutachterin')
  })

  it('drops tagesrouten with fewer than 2 stops', () => {
    const empty = makeTagesRoute({ stops: [] })
    const single = makeTagesRoute({
      stops: [{ terminId: 't-1', lat: 52.52, lng: 13.405, startZeit: '2026-07-04T09:00:00Z', reihenfolge: 1 }],
    })
    expect(tagesroutenFC([empty]).features).toHaveLength(0)
    expect(tagesroutenFC([single]).features).toHaveLength(0)
  })

  it('returns empty FC for empty array', () => {
    expect(tagesroutenFC([]).features).toHaveLength(0)
  })
})

// --- leadsFC ---

const makeLead = (overrides: Partial<LeadPin> = {}): LeadPin => ({
  id: 'lead-1',
  name: 'Anna Muster',
  status: 'neu',
  lat: 48.137,
  lng: 11.576,
  ort: 'München',
  kanal: 'self_service',
  erstelltAm: '2026-07-04T08:00:00Z',
  ...overrides,
})

describe('leadsFC', () => {
  it('maps one LeadPin to one Point feature with lng-first coords', () => {
    const lead = makeLead()
    const fc = leadsFC([lead])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.type).toBe('Feature')
    expect(f.geometry.type).toBe('Point')
    const coords = (f.geometry as GeoJSON.Point).coordinates
    expect(coords[0]).toBe(lead.lng)
    expect(coords[1]).toBe(lead.lat)
  })

  it('sets __id, __type and status on properties', () => {
    const lead = makeLead({ id: 'lead-42', status: 'aktiv' })
    const f = leadsFC([lead]).features[0]
    expect(f.properties?.__id).toBe('lead-42')
    expect(f.properties?.__type).toBe('lead')
    expect(f.properties?.status).toBe('aktiv')
  })

  it('returns empty FC for empty array', () => {
    expect(leadsFC([]).features).toHaveLength(0)
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
