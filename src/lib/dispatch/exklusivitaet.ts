import type { SupabaseClient } from '@supabase/supabase-js'

// KFZ-152 Phase 3: Exklusivitaets-Check fuer Communities.
// Wenn ein Lead/Fall-Standort in einem `gebiet_exklusivitaeten`-Polygon
// liegt UND diese Org Exklusivitaet aktiv hat, duerfen NUR SVs aus DIESER
// Org den Lead bekommen — andere SVs werden geblockt.
//
// MVP-Geometrie: einfacher Kreis (zentrum_lat/lng + radius_km) statt echtem
// Polygon. Der Eintrag in gebiet_exklusivitaeten.isochron_geojson hat das
// Format { type: 'Circle', coordinates: [lng, lat], radius_km }. Echtes
// Polygon-Drawing kommt im Folge-Auftrag.

type ExklusivitaetMatch = {
  exklusiv: boolean
  organisation_id: string | null
  community_name: string | null
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Prueft ob die uebergebenen Geo-Koordinaten in einem aktiven Exklusivitaets-
 * Gebiet liegen. Returnt das erste Match (oder { exklusiv: false } wenn frei).
 */
export async function checkExklusivitaet(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
): Promise<ExklusivitaetMatch> {
  const today = new Date().toISOString()
  const { data: gebiete } = await supabase
    .from('gebiet_exklusivitaeten')
    .select('id, organisation_id, isochron_geojson, aktiv_seit, aktiv_bis')
    .lte('aktiv_seit', today)
    .or(`aktiv_bis.is.null,aktiv_bis.gt.${today}`)

  if (!gebiete?.length) return { exklusiv: false, organisation_id: null, community_name: null }

  for (const g of gebiete) {
    const geo = g.isochron_geojson as { type?: string; coordinates?: [number, number]; radius_km?: number } | null
    if (!geo || geo.type !== 'Circle' || !geo.coordinates || geo.radius_km == null) continue
    const [centerLng, centerLat] = geo.coordinates
    const distance = haversineKm(centerLat, centerLng, lat, lng)
    if (distance <= geo.radius_km) {
      // Match — Org-Name nachladen
      const { data: org } = await supabase
        .from('organisationen')
        .select('name')
        .eq('id', g.organisation_id as string)
        .maybeSingle()
      return {
        exklusiv: true,
        organisation_id: g.organisation_id as string,
        community_name: org?.name ?? null,
      }
    }
  }

  return { exklusiv: false, organisation_id: null, community_name: null }
}
