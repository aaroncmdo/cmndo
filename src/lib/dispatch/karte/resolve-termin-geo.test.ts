import { describe, expect, it } from 'vitest'
import { resolveTerminGeo } from './resolve-termin-geo'
import type { PlzGeoRow, RawTerminForKarte } from './types'

const base: RawTerminForKarte = {
  id: 't-1',
  start_zeit: '2026-05-14T10:00:00Z',
  status: 'bestaetigt',
  fall_id: null,
  lead_id: null,
  sv_id: null,
  gps_lat_ankunft: null,
  gps_lng_ankunft: null,
  lead_lat: null,
  lead_lng: null,
  lead_vorname: null,
  lead_nachname: null,
  sv_lat: null,
  sv_lng: null,
  sv_vorname: null,
  sv_nachname: null,
  claim_nummer: null,
}

const plzMap = new Map<string, PlzGeoRow>([
  ['10115', { plz: '10115', lat: 52.53, lng: 13.38, ort: 'Berlin' }],
])

describe('resolveTerminGeo', () => {
  it('priorisiert gps_ankunft als Quelle wenn vorhanden', () => {
    const r = resolveTerminGeo({ ...base, gps_lat_ankunft: 51.0, gps_lng_ankunft: 13.7, lead_lat: 50.0, lead_lng: 8.0 }, plzMap, null)
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.geoSource).toBe('gps_ankunft')
    expect(r.pin.lat).toBe(51.0)
  })

  it('fällt auf lead_lat/lng zurück', () => {
    const r = resolveTerminGeo({ ...base, lead_lat: 50.1, lead_lng: 8.7 }, plzMap, null)
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.geoSource).toBe('lead_besichtigung')
    expect(r.pin.lat).toBe(50.1)
  })

  it('fällt auf sv_lat/lng zurück wenn lead keine Geo hat', () => {
    const r = resolveTerminGeo({ ...base, sv_lat: 48.13, sv_lng: 11.57 }, plzMap, null)
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.geoSource).toBe('sv_standort')
  })

  it('nutzt PLZ-Centroid via leadPlz wenn alles andere fehlt', () => {
    const r = resolveTerminGeo(base, plzMap, '10115')
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.geoSource).toBe('plz_centroid')
    expect(r.pin.lat).toBe(52.53)
  })

  it('liefert unlocalized wenn keine Quelle greift', () => {
    const r = resolveTerminGeo(base, plzMap, null)
    expect(r.kind).toBe('unlocalized')
  })

  it('füllt sv_initialen aus sv_vorname+nachname', () => {
    const r = resolveTerminGeo(
      { ...base, gps_lat_ankunft: 51, gps_lng_ankunft: 13, sv_vorname: 'Max', sv_nachname: 'Mustermann' },
      plzMap,
      null,
    )
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.sv_initialen).toBe('MM')
  })

  it('füllt kunde_name aus lead_vorname+nachname', () => {
    const r = resolveTerminGeo(
      { ...base, gps_lat_ankunft: 51, gps_lng_ankunft: 13, lead_vorname: 'Anna', lead_nachname: 'Schmidt' },
      plzMap,
      null,
    )
    expect(r.kind).toBe('pin')
    if (r.kind !== 'pin') return
    expect(r.pin.kunde_name).toBe('Anna Schmidt')
  })
})
