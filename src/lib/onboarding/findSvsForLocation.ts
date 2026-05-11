'use server'

// 2026-05-11: Tier-aware SV-Matching fuer /gutachter-finden Karte + Wizard.
//
// Gibt eine priorisierte Liste aller fuer einen Schadens-Standort verfuegbaren
// SVs zurueck:
//
//   Tier 1 (sachverstaendige):  Echte Pro/Premium-Partner mit Calendar-Sync.
//                               Wenn ≥1 Treffer im Iso → NUR diese Liste.
//   Tier 3 (sv_leads tier=free):  Fallback nur wenn 0 Tier-1-Treffer.
//   Tier 2 (sv_leads tier=basic):  Skizziert in docs/plans/sv-basic-tier.md,
//                                  noch nicht aktiv.
//
// Konsumiert von der Mapbox-Karte (Marker-Rendering) und vom DynamicWizard
// (SlotField muss wissen welcher Pool angeboten wird).
//
// Implementierung: dünner Wrapper um findBestSV (Tier 1) und einen direkten
// sv_leads-Query mit Iso/Haversine-Check (Tier 3). KEINE Slot-Berechnung
// hier — das uebernimmt PR #3 (lib/slots/standard-availability.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV } from '@/lib/dispatch/findBestSV'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'

export type SvTier = 'pro' | 'basic' | 'free'

export type SvForLocation = {
  tier: SvTier
  /** Bei tier='pro' = sachverstaendige.id, sonst sv_leads.id */
  id: string
  /** Anzeige-Name: firmenname oder firma oder name */
  name: string
  /** Strasse/PLZ/Ort-Snippet fuer Tooltip */
  adresse: string | null
  /** Standort fuer Karten-Marker */
  lat: number
  lng: number
  distanzKm: number
  /** Iso-Polygon (GeoJSON oder null wenn nicht gesetzt) */
  isochronePolygon: unknown
  /** Tier 1 only: Paket-Stufe (premium/pro/standard) */
  paket?: string
  /** Tier 1 only: Score aus findBestSV */
  score?: number
  /** Tier 1 only: Reasons-Badges aus findBestSV */
  reasons?: string[]
}

export type FindSvsResult = {
  /** Welcher Tier wurde ausgegeben (das hoechste mit ≥1 Treffer) */
  servedTier: SvTier
  /** Vollstaendige Trefferliste in Anzeige-Reihenfolge */
  svs: SvForLocation[]
  /** Statistik fuer Logging/UI-Banner */
  countByTier: Record<SvTier, number>
}

/**
 * Findet alle SVs die den Schadens-Standort abdecken, priorisiert nach Tier.
 *
 * @param lat   WGS84-Breitengrad des Schadens-/Fahrzeug-Standorts
 * @param lng   WGS84-Laengengrad
 * @param wunschterminIso optional: ISO-Timestamp fuer Wunschtermin-Filter
 *              (wirkt nur auf Tier 1 — Calendar-Konflikt-Check)
 * @param limit max Treffer pro Tier (default 10)
 */
export async function findSvsForLocation(
  lat: number,
  lng: number,
  wunschterminIso?: string | null,
  limit = 10,
): Promise<FindSvsResult> {
  const countByTier: Record<SvTier, number> = { pro: 0, basic: 0, free: 0 }

  // ─── Tier 1 ───────────────────────────────────────────────────────────
  // findBestSV macht die schwere Arbeit: applyDispatchableFilter
  // (aktiv + portal_zugang + nicht gesperrt), Iso-Check, Paket-Prio,
  // Kalender-FreeBusy, Wunschtermin-Konflikt, Sticky-SV.
  //
  // Nachzieher: findBestSV gibt name/distanz/score zurueck, aber nicht
  // lat/lng/iso_polygon (die brauchen wir fuer den Karten-Marker). Nach
  // dem Score-Match laden wir die Geo-Felder fuer die Treffer-IDs nach.
  const db = createAdminClient()
  let tier1: SvForLocation[] = []
  try {
    const candidates = await findBestSV(
      {
        fallLat: lat,
        fallLng: lng,
        wunschterminIso: wunschterminIso ?? null,
      },
      limit,
    )
    if (candidates.length > 0) {
      const ids = candidates.map((c) => c.svId)
      const { data: geoRows } = await db
        .from('sachverstaendige')
        .select('id, standort_lat, standort_lng, isochrone_polygon, standort_adresse, firmenname')
        .in('id', ids)
      const geoById = new Map<string, { lat: number | null; lng: number | null; iso: unknown; adresse: string | null; firma: string | null }>()
      for (const g of (geoRows ?? []) as Array<{
        id: string
        standort_lat: number | null
        standort_lng: number | null
        isochrone_polygon: unknown
        standort_adresse: string | null
        firmenname: string | null
      }>) {
        geoById.set(g.id, { lat: g.standort_lat, lng: g.standort_lng, iso: g.isochrone_polygon, adresse: g.standort_adresse, firma: g.firmenname })
      }
      tier1 = candidates
        .map<SvForLocation | null>((c) => {
          const g = geoById.get(c.svId)
          if (!g || g.lat == null || g.lng == null) return null
          return {
            tier: 'pro',
            id: c.svId,
            name: g.firma || c.name,
            adresse: g.adresse,
            lat: g.lat,
            lng: g.lng,
            distanzKm: c.distanzKm,
            isochronePolygon: g.iso,
            paket: c.paket,
            score: c.score,
            reasons: c.reasons,
          }
        })
        .filter((s): s is SvForLocation => s !== null)
      countByTier.pro = tier1.length
    }
  } catch (err) {
    console.error('[findSvsForLocation] Tier 1 fail:', err)
  }

  if (tier1.length > 0) {
    return { servedTier: 'pro', svs: tier1, countByTier }
  }

  // ─── Tier 3 (Fallback aus sv_leads) ───────────────────────────────────
  // Aktuell: alle sv_leads sind tier='free' (Spalte folgt mit Basic-Tier-PR).
  // Iso-Check zuerst, Haversine ≤ 25 km als Fallback.
  const { data: leadsRaw, error: leadsErr } = await db
    .from('sv_leads')
    .select('id, name, firma, vorname, adresse, plz, ort, lat, lng, isochrone_polygon, paket_umkreis_km')
    .eq('ist_aktiv', true)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (leadsErr) console.error('[findSvsForLocation] Tier 3 query:', leadsErr.message)

  type LeadRow = {
    id: string
    name: string | null
    firma: string | null
    vorname: string | null
    adresse: string
    plz: string | null
    ort: string | null
    lat: number
    lng: number
    isochrone_polygon: unknown
    paket_umkreis_km: number | null
  }

  const leadsList: SvForLocation[] = []
  for (const lead of (leadsRaw ?? []) as LeadRow[]) {
    const polygon = parseIsochrone(lead.isochrone_polygon)
    const distanzKm = haversine(lat, lng, lead.lat, lead.lng)
    let imRadius = false

    if (polygon && polygon.length >= 3) {
      imRadius = pointInPolygon([lng, lat], polygon)
    } else {
      const maxKm = lead.paket_umkreis_km ?? 25
      imRadius = distanzKm <= maxKm
    }
    if (!imRadius) continue

    leadsList.push({
      tier: 'free',
      id: lead.id,
      name: lead.firma || lead.name || 'Unbekannt',
      adresse: lead.adresse,
      lat: lead.lat,
      lng: lead.lng,
      distanzKm,
      isochronePolygon: lead.isochrone_polygon,
    })
  }

  leadsList.sort((a, b) => a.distanzKm - b.distanzKm)
  const tier3 = leadsList.slice(0, limit)
  countByTier.free = tier3.length

  return {
    servedTier: 'free',
    svs: tier3,
    countByTier,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

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
