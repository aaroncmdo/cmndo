import { describe, it, expect } from 'vitest'
import { makeGeocodeMitFallback } from './geocode'

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
