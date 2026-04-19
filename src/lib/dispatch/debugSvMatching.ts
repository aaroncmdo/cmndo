// AAR-521: Debug-Variante von findBestSV.
// Statt nur die Treffer zurückzugeben, liefert diese Funktion pro SV den
// Filter-Grund — damit Dispatch/Admin im UI sehen kann warum ein bestimmter
// SV NICHT in der Liste auftaucht (Urlaub, Kontingent, kein Standort,
// außerhalb Isochrone+Radius, Koordinaten-Problem).

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from './isochrone-parse'

// Haversine (km) — Kopie aus findBestSV, nicht exportiert dort.
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export type DebugSvMatchResult = {
  svId: string
  name: string
  paket: string
  status: 'passt' | 'rausgefiltert'
  grund: string
  distanzKm: number | null
  radius: number
  hatIsochrone: boolean
  isochroneValid: boolean
  imPolygon: boolean | null
  kontingentFrei: number
  imUrlaub: boolean
}

export type DebugSvMatchingResponse = {
  fallLat: number
  fallLng: number
  gesamt: number
  passend: number
  results: DebugSvMatchResult[]
}

export async function debugSvMatchingByCoords(
  fallLat: number,
  fallLng: number,
  terminDatum?: string,
): Promise<DebugSvMatchingResponse> {
  const db = createAdminClient()

  const { data: svsRaw } = await db
    .from('sachverstaendige')
    .select(
      'id, paket, standort_lat, standort_lng, isochrone_polygon, ' +
        'paket_umkreis_km, ' +
        'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, ' +
        'urlaub_von, urlaub_bis, ist_aktiv, gesperrt_seit, ' +
        'profiles(vorname, nachname)',
    )
    .eq('ist_aktiv', true)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)

  if (!svsRaw) {
    return { fallLat, fallLng, gesamt: 0, passend: 0, results: [] }
  }

  const svs = svsRaw as unknown as Array<Record<string, unknown>>
  const results: DebugSvMatchResult[] = []

  for (const sv of svs) {
    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    const name = profile
      ? `${(profile as { vorname?: string }).vorname ?? ''} ${(profile as { nachname?: string }).nachname ?? ''}`.trim() || '—'
      : '—'
    const paket = (sv.paket as string) || 'standard'
    const radius = Number(sv.paket_umkreis_km) || 40

    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt =
      Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt

    // Urlaub
    const urlaubVon = sv.urlaub_von as string | null
    const urlaubBis = sv.urlaub_bis as string | null
    let imUrlaub = false
    if (terminDatum && urlaubVon && urlaubBis) {
      const t = new Date(terminDatum).getTime()
      if (t >= new Date(urlaubVon).getTime() && t <= new Date(urlaubBis).getTime()) {
        imUrlaub = true
      }
    }

    // Polygon-Parse vorab — auch wenn Filter schon vorher greift
    const polygon = parseIsochrone(sv.isochrone_polygon)
    const hatIsochrone = sv.isochrone_polygon != null
    const isochroneValid = polygon !== null

    let distanzKm: number | null = null
    let imPolygon: boolean | null = null
    if (sv.standort_lat != null && sv.standort_lng != null) {
      distanzKm = haversine(Number(sv.standort_lat), Number(sv.standort_lng), fallLat, fallLng)
      if (polygon) {
        imPolygon = pointInPolygon([fallLng, fallLat], polygon)
      }
    }

    const base = {
      svId: sv.id as string,
      name,
      paket,
      distanzKm: distanzKm != null ? Math.round(distanzKm * 10) / 10 : null,
      radius,
      hatIsochrone,
      isochroneValid,
      imPolygon,
      kontingentFrei,
      imUrlaub,
    }

    if (imUrlaub) {
      results.push({ ...base, status: 'rausgefiltert', grund: `im Urlaub (${urlaubVon} → ${urlaubBis})` })
      continue
    }
    if (kontingentFrei <= 0) {
      results.push({ ...base, status: 'rausgefiltert', grund: `Kontingent voll (${kontingentGenutzt}/${kontingentGesamt})` })
      continue
    }
    if (sv.standort_lat == null || sv.standort_lng == null) {
      results.push({ ...base, status: 'rausgefiltert', grund: 'kein Standort (lat/lng) hinterlegt' })
      continue
    }
    const d = distanzKm ?? Infinity
    const polygonHit = imPolygon === true
    const radiusHit = d <= radius
    if (!polygonHit && !radiusHit) {
      const polygonInfo = hatIsochrone
        ? isochroneValid
          ? 'außerhalb Isochrone'
          : 'Isochrone-Format unlesbar'
        : 'keine Isochrone'
      results.push({
        ...base,
        status: 'rausgefiltert',
        grund: `zu weit: ${Math.round(d)}km > ${radius}km Radius (${polygonInfo})`,
      })
      continue
    }

    const matchReason = polygonHit
      ? 'im Einsatzgebiet (Isochrone)'
      : `${Math.round(d)}km (Radius-Fallback)`
    results.push({ ...base, status: 'passt', grund: matchReason })
  }

  const passend = results.filter((r) => r.status === 'passt').length
  return { fallLat, fallLng, gesamt: svs.length, passend, results }
}
