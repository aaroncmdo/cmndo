import { getLiveOpsSvs } from './get-live-svs'
import { fetchDrivingRoute } from '@/lib/mapbox/directions'
import type { UnterwegsRoute, LiveOpsScope, SvLiveOps } from './types'

/**
 * SVs die gerade unterwegs sind (car.mode !== 'none', Positions- und Zielkoords bekannt)
 * -> echte Fahrtroute via Mapbox Directions API.
 * Bei Fehler pro SV: SV ueberspringen (kein throw).
 *
 * @param preloadedSvs - optional: bereits geladene SVs (verhindert doppelten getLiveOpsSvs-Aufruf)
 */
export async function getUnterwegsRouten(scope: LiveOpsScope, preloadedSvs?: SvLiveOps[]): Promise<UnterwegsRoute[]> {
  const svs = preloadedSvs ?? await getLiveOpsSvs(scope)

  const unterwegs = svs.filter(
    (sv) =>
      sv.car.mode !== 'none' &&
      sv.car.lat != null &&
      sv.car.lng != null &&
      sv.car.zielLat != null &&
      sv.car.zielLng != null,
  )

  if (unterwegs.length === 0) return []

  const results = await Promise.allSettled(
    unterwegs.map(async (sv) => {
      // Mapbox Directions erwartet [lng, lat] Tupel
      const start: [number, number] = [sv.car.lng as number, sv.car.lat as number]
      const end: [number, number] = [sv.car.zielLng as number, sv.car.zielLat as number]
      const route = await fetchDrivingRoute(start, end)
      return { svId: sv.id, coords: route.primary.coords } satisfies UnterwegsRoute
    }),
  )

  const routen: UnterwegsRoute[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      routen.push(result.value)
    } else {
      console.error('[getUnterwegsRouten] route fetch failed for sv', unterwegs[i]?.id, result.reason)
    }
  }

  return routen
}
