import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'

export interface GeoTreffer { lat: number; lng: number; adresse: string | null; placeId: string | null }
export type Geocoder = (adresse: string) => Promise<GeoTreffer | null>

/** Testbare Fabrik: injizierbare mapbox-/google-Backends. */
export function makeGeocodeMitFallback(
  mapbox: (a: string) => Promise<GeoTreffer | null>,
  google: (a: string) => Promise<GeoTreffer | null>,
): Geocoder {
  return async (adresse: string) => (await mapbox(adresse)) ?? (await google(adresse))
}

/** Produktions-Geocoder: mapbox bevorzugt (Routing-Konsistenz), google Fallback. */
export const geocodeMitFallback: Geocoder = makeGeocodeMitFallback(
  async (a) => {
    const r = await geocodeAdresse(a)
    return r ? { lat: r.lat, lng: r.lng, adresse: r.formatted, placeId: r.placeId } : null
  },
  async (a) => {
    const r = await geocodeAddress(a)
    return r.ok ? { lat: r.data.lat, lng: r.data.lng, adresse: r.data.formatted_address, placeId: r.data.place_id } : null
  },
)
