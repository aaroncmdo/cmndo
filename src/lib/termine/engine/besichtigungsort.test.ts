import { describe, it, expect } from 'vitest'
import { makeGeocodeMitFallback } from './geocode'
import { resolveBesichtigungsort } from './besichtigungsort'

const fakeGeo = async (a: string) => (a ? { lat: 50, lng: 7, adresse: a, placeId: 'p' } : null)
const dbStub = (rows: Record<string, unknown>) => ({
  from: (t: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[t] ?? null }) }) }),
  }),
}) as never

describe('geocodeMitFallback', () => {
  it('nimmt mapbox wenn es liefert', async () => {
    const g = makeGeocodeMitFallback(
      async () => ({ lat: 1, lng: 2, adresse: 'M', placeId: 'm1' }),
      async () => { throw new Error('google darf nicht') },
    )
    expect(await g('x')).toEqual({ lat: 1, lng: 2, adresse: 'M', placeId: 'm1' })
  })
  it('faellt auf google zurueck wenn mapbox null', async () => {
    const g = makeGeocodeMitFallback(
      async () => null,
      async () => ({ lat: 3, lng: 4, adresse: 'G', placeId: 'g1' }),
    )
    expect(await g('x')).toEqual({ lat: 3, lng: 4, adresse: 'G', placeId: 'g1' })
  })
  it('null wenn beide nichts liefern', async () => {
    const g = makeGeocodeMitFallback(
      async () => null,
      async () => null,
    )
    expect(await g('x')).toBeNull()
  })
})

describe('resolveBesichtigungsort', () => {
  it('nimmt Termin-Koordinaten direkt (kein geocode)', async () => {
    const r = await resolveBesichtigungsort(
      { besichtigungsort_lat: 48, besichtigungsort_lng: 11, besichtigungsort_adresse: 'X', claim_id: null, fall_id: null, lead_id: null },
      dbStub({}),
      async () => { throw new Error('no geocode') },
    )
    expect(r).toMatchObject({ lat: 48, lng: 11, quelle: 'termin' })
  })
  it('geocodet Lead-fahrzeug_standort_adresse wenn keine Coords', async () => {
    const r = await resolveBesichtigungsort(
      { besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, claim_id: null, fall_id: null, lead_id: 'L' },
      dbStub({
        leads: {
          besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null,
          fahrzeug_standort_lat: null, fahrzeug_standort_lng: null, fahrzeug_standort_adresse: 'Musterstr 1',
          kunde_adresse: null, kunde_strasse: null, kunde_plz: null,
        },
      }),
      fakeGeo,
    )
    expect(r).toMatchObject({ lat: 50, lng: 7, quelle: 'lead' })
  })
  it('null wenn nichts aufloesbar', async () => {
    const r = await resolveBesichtigungsort(
      { besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, claim_id: null, fall_id: null, lead_id: null },
      dbStub({}),
      fakeGeo,
    )
    expect(r).toBeNull()
  })
})
