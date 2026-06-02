import { describe, it, expect } from 'vitest'
import { makeGeocodeMitFallback } from './geocode'
import { resolveBesichtigungsort } from './besichtigungsort'
import { bestaetige } from './bestaetige'

const fakeGeo = async (a: string) => (a ? { lat: 50, lng: 7, adresse: a, placeId: 'p' } : null)
const dbStub = (rows: Record<string, unknown>) => ({
  from: (t: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[t] ?? null }) }) }),
  }),
}) as never

/** db-Stub fuer bestaetige: unterstuetzt select+maybeSingle (Termin-Laden) + update+eq + insert */
function makeBestaetigeDbStub(terminRow: Record<string, unknown> | null) {
  const patches: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []
  const stub = {
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () => ({
            data: table === 'gutachter_termine' ? terminRow : null,
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        patches.push({ ...patch, _table: table })
        return { eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }) }
      },
      insert: (row: Record<string, unknown>) => {
        inserts.push({ ...row, _table: table })
        return Promise.resolve({ error: null })
      },
    }),
    _patches: patches,
    _inserts: inserts,
  }
  return stub as never
}

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

describe('bestaetige', () => {
  it('Remote (kanal=video) → ok:true, quelle:remote, kein geocode', async () => {
    let geocodeCalled = false
    const db = makeBestaetigeDbStub({
      id: 't1', kanal: 'video', sv_id: null, fall_id: null, claim_id: null, lead_id: null,
      besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, start_zeit: '2099-01-01T10:00:00Z',
    })
    const r = await bestaetige('t1', {
      db,
      geocode: async () => { geocodeCalled = true; return null },
    })
    expect(r).toMatchObject({ ok: true, quelle: 'remote' })
    expect(geocodeCalled).toBe(false)
  })

  it('Vor-Ort ohne aufloesbares Ziel → ok:false, code:kein_ziel', async () => {
    const db = makeBestaetigeDbStub({
      id: 't2', kanal: null, sv_id: null, fall_id: null, claim_id: null, lead_id: null,
      besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, start_zeit: '2099-01-01T10:00:00Z',
    })
    const r = await bestaetige('t2', { db, geocode: async () => null })
    expect(r).toMatchObject({ ok: false, code: 'kein_ziel' })
  })

  it('Vor-Ort mit Termin-Coords → ok:true, status=bestaetigt, koordinaten gecacht', async () => {
    const db = makeBestaetigeDbStub({
      id: 't3', kanal: null, sv_id: null, fall_id: null, claim_id: null, lead_id: null,
      besichtigungsort_lat: 48.5, besichtigungsort_lng: 9.5, besichtigungsort_adresse: 'Ort X', start_zeit: '2099-01-01T10:00:00Z',
    })
    const r = await bestaetige('t3', {
      db,
      geocode: async () => { throw new Error('no geocode expected') },
    })
    expect(r).toMatchObject({ ok: true, besichtigungsortLat: 48.5, besichtigungsortLng: 9.5, quelle: 'termin' })
  })
})
