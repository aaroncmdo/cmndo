// AAR-50: Dispatch-Algorithmus — findBestSV
// Findet die besten Sachverständigen für einen Fall basierend auf:
// - Aktivität + nicht gesperrt
// - Urlaub-Check
// - Kontingent (Paket-Limit vs. genutzte Fälle)
// - Distanz (Isochrone oder Radius)
// - Paket-Prio (premium > pro > standard)
// - Balance (wenig offene Fälle bevorzugt)
// - Ablehnungsrate (wenig Ablehnungen bevorzugt)

import { createAdminClient } from '@/lib/supabase/admin'

export type SvMatchInput = {
  fallLat: number
  fallLng: number
  terminDatum?: string // ISO-Datum optional (für Urlaub-Check)
}

export type SvMatchCandidate = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  // Badge-Gründe für UI
  reasons: string[]
}

const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Point-in-polygon (ray-casting)
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

export async function findBestSV(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  const db = createAdminClient()
  const { fallLat, fallLng, terminDatum } = input

  const { data: svsRaw } = await db
    .from('sachverstaendige')
    .select(
      'id, profile_id, paket, standort_lat, standort_lng, isochrone_polygon, ' +
        'paket_radius_km, paket_umkreis_km, radius_km, ' +
        'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, max_faelle_monat, ' +
        'urlaub_von, urlaub_bis, ist_aktiv, gesperrt_seit, ablehnungen_30_tage, ' +
        'profiles(vorname, nachname)',
    )
    .eq('ist_aktiv', true)
    .is('gesperrt_seit', null)
    .is('geloescht_am', null)

  if (!svsRaw) return []
  const svs = svsRaw as unknown as Array<Record<string, unknown>>

  const candidates: SvMatchCandidate[] = []

  for (const sv of svs) {
    const reasons: string[] = []

    // Urlaub-Check
    const urlaubVon = sv.urlaub_von as string | null
    const urlaubBis = sv.urlaub_bis as string | null
    if (terminDatum && urlaubVon && urlaubBis) {
      const t = new Date(terminDatum).getTime()
      if (t >= new Date(urlaubVon).getTime() && t <= new Date(urlaubBis).getTime()) {
        continue // Im Urlaub
      }
    }

    // Kontingent-Check
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || Number(sv.max_faelle_monat) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    if (kontingentFrei <= 0) continue

    // Standort vorhanden?
    if (sv.standort_lat == null || sv.standort_lng == null) continue

    // Distanz-Check (Isochrone oder Radius)
    const distanzKm = haversine(Number(sv.standort_lat), Number(sv.standort_lng), fallLat, fallLng)
    const radius = Number(sv.paket_umkreis_km) || Number(sv.radius_km) || Number(sv.paket_radius_km) || 40

    // Isochrone hat Vorrang wenn vorhanden
    let imGebiet = false
    const iso = sv.isochrone_polygon as { coordinates?: [number, number][][] } | null
    if (iso?.coordinates?.[0]?.length) {
      imGebiet = pointInPolygon([fallLng, fallLat], iso.coordinates[0])
      if (imGebiet) reasons.push('im Einsatzgebiet')
    } else if (distanzKm <= radius) {
      imGebiet = true
      reasons.push(`${Math.round(distanzKm)}km (max ${radius})`)
    }

    if (!imGebiet) continue

    const paket = (sv.paket as string) || 'standard'
    const paketPrio = PAKET_PRIO[paket] ?? 1
    const ablehnungen = Number(sv.ablehnungen_30_tage) || 0

    // Score: höher = besser
    // +100 pro Paket-Stufe, -2 pro offenem Fall, -2 pro Ablehnung, -1 pro km
    const score = paketPrio * 100 - kontingentGenutzt * 2 - ablehnungen * 2 - distanzKm
    reasons.push(`Paket: ${paket}`)
    reasons.push(`${kontingentFrei}/${kontingentGesamt} frei`)

    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    candidates.push({
      svId: sv.id as string,
      profileId: (sv.profile_id as string) ?? null,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      paket,
      distanzKm: Math.round(distanzKm * 10) / 10,
      offeneFaelle: kontingentGenutzt,
      kontingentFrei,
      ablehnungen30d: ablehnungen,
      score,
      reasons,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, limit)
}
