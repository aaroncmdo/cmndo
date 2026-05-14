import { describe, expect, it } from 'vitest'
import { resolveLeadGeo } from './triage-leads'
import type { RawLeadForKarte } from './types'

const base: RawLeadForKarte = {
  id: 'lead-1',
  vorname: 'Anna',
  nachname: 'Schmidt',
  firma_name: null,
  schadentyp: 'haftpflicht',
  besichtigungsort_lat: null,
  besichtigungsort_lng: null,
  besichtigungsort_plz: null,
  besichtigungsort_stadt: null,
  unfallort_lat: null,
  unfallort_lng: null,
  unfallort_plz: null,
  kunde_plz: null,
  kunde_stadt: null,
  created_at: '2026-05-14T10:00:00Z',
}

const plzMap = new Map([
  ['10115', { plz: '10115', lat: 52.53, lng: 13.38, ort: 'Berlin' }],
])

describe('resolveLeadGeo', () => {
  it('nutzt besichtigungsort_lat/lng wenn vorhanden', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_lat: 50.1, besichtigungsort_lng: 8.7, besichtigungsort_plz: '60311', besichtigungsort_stadt: 'Frankfurt' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.lat).toBe(50.1)
    expect(result.pin.lng).toBe(8.7)
    expect(result.pin.geoSource).toBe('besichtigungsort')
    expect(result.pin.plz).toBe('60311')
    expect(result.pin.ort).toBe('Frankfurt')
  })

  it('fällt auf unfallort_lat/lng zurück wenn besichtigungsort fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, unfallort_lat: 48.13, unfallort_lng: 11.57, unfallort_plz: '80331' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('unfallort')
    expect(result.pin.lat).toBe(48.13)
  })

  it('fällt auf PLZ-Centroid zurück wenn keine lat/lng aber besichtigungsort_plz gemapped', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
    expect(result.pin.lat).toBe(52.53)
    expect(result.pin.ort).toBe('Berlin')
  })

  it('nutzt unfallort_plz wenn besichtigungsort_plz fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, unfallort_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
    expect(result.pin.plz).toBe('10115')
  })

  it('nutzt kunde_plz wenn alles andere fehlt', () => {
    const result = resolveLeadGeo(
      { ...base, kunde_plz: '10115' },
      plzMap,
    )
    expect(result.kind).toBe('pin')
    if (result.kind !== 'pin') return
    expect(result.pin.geoSource).toBe('plz_centroid')
  })

  it('liefert "unlocalized" wenn keine Geo-Quelle greift', () => {
    const result = resolveLeadGeo(base, plzMap)
    expect(result.kind).toBe('unlocalized')
  })

  it('liefert "unlocalized" wenn PLZ nicht in plzMap', () => {
    const result = resolveLeadGeo(
      { ...base, besichtigungsort_plz: '99999' },
      plzMap,
    )
    expect(result.kind).toBe('unlocalized')
  })
})
