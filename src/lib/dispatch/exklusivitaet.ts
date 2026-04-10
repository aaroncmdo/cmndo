import type { SupabaseClient } from '@supabase/supabase-js'

// KFZ-152 Phase 3: Exklusivitaets-Check fuer Communities.
// Wenn ein Lead/Fall-Standort in einem `gebiet_exklusivitaeten`-Polygon
// liegt UND diese Org Exklusivitaet aktiv hat, duerfen NUR SVs aus DIESER
// Org den Lead bekommen — andere SVs werden geblockt.
//
// Geometrie: zwei Varianten werden unterstuetzt:
//   1. Circle (MVP):  { type: 'Circle', coordinates: [lng, lat], radius_km }
//   2. Polygon (Phase 3 Follow-up): GeoJSON-Polygon
//      { type: 'Polygon', coordinates: [[[lng,lat], ...]] }
// Polygon hat Vorrang wenn beides gespeichert ist; in der Praxis enthaelt der
// Eintrag immer nur eine Geometrie pro Community.

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

// KFZ-152 Phase 3 Follow-up: Ray-Casting Point-in-Polygon (GeoJSON: [lng,lat]).
// Returnt true wenn (lat,lng) im Polygon-Ring liegt.
function pointInPolygonRing(ring: [number, number][], lat: number, lng: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xiLng, xiLat] = ring[i]
    const [xjLng, xjLat] = ring[j]
    const intersect =
      ((xiLat > lat) !== (xjLat > lat)) &&
      (lng < ((xjLng - xiLng) * (lat - xiLat)) / (xjLat - xiLat || 1e-12) + xiLng)
    if (intersect) inside = !inside
  }
  return inside
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
    const geo = g.isochron_geojson as {
      type?: string
      coordinates?: unknown
      radius_km?: number
    } | null
    if (!geo || !geo.type) continue

    let match = false

    if (geo.type === 'Polygon' && Array.isArray(geo.coordinates)) {
      // GeoJSON Polygon: coordinates = [outerRing, hole1, hole2, ...]
      // Wir checken nur den outer ring (Holes ignorieren wir bewusst, da ein
      // Community-Gebiet i.d.R. kein Loch hat).
      const rings = geo.coordinates as number[][][]
      const outer = rings[0] as [number, number][] | undefined
      if (outer && outer.length >= 3) {
        match = pointInPolygonRing(outer, lat, lng)
      }
    } else if (geo.type === 'Circle' && Array.isArray(geo.coordinates) && geo.radius_km != null) {
      const [centerLng, centerLat] = geo.coordinates as [number, number]
      const distance = haversineKm(centerLat, centerLng, lat, lng)
      match = distance <= geo.radius_km
    }

    if (match) {
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
