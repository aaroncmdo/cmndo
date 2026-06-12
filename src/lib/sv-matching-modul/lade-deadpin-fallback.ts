// AAR-956 Dead-Pin-Fallback — Body: ladeDeadPinFallback + generischeDeadPinSlots.
//
// Standalone: NUR die Tier-3-sv_leads-Coverage (leak-safe), KEIN Partner-Match — der
// Consumer ruft das via `onKeinMatch` (genau bei 0 Partnern). Reuse der bewaehrten
// Coverage-Logik aus findSvsForLocation (parseIsochrone + pointInPolygon, sonst Haversine
// <= paket_umkreis_km). Slots = generisch immer-frei (KEIN freieSlots/ETA/Busy) — der
// Kunde waehlt eine Wunsch-Zeit, Dispatch bestaetigt + koordiniert manuell.
//
// KEIN 'use server' (plain module, server-seitig aufgerufen wie planeTerminOeffentlich)
// und KEINE Server-Imports in ./fallback (das bleibt reine Typ-Ebene fuer Client-Import).

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { haversineKm, pointInPolygon } from '@/lib/termine/engine'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { rundeDistanz } from './projection'
import type { SlotVorschlag } from './types'
import type { DeadPinOeffentlich, LadeDeadPinFallback } from './fallback'

const FALLBACK_FENSTER_TAGE = 14
const MAX_DEAD_PINS = 5
const DEFAULT_UMKREIS_KM = 25
const TERMIN_DAUER_MIN = 90
// Standard-Anbietfenster (Berlin-Wall-Clock-Stunden) an Werktagen — Dispatch bestaetigt die echte Zeit.
const SLOT_STUNDEN = [9, 11, 14, 16]
const MAX_SLOTS = 6

/**
 * Generische „immer-frei"-Slots fuer Dead-Pins: naechste Tage (ohne Sonntag) zu
 * Standard-Stunden, ab jetzt. KEIN Kalender/Busy/ETA. Berlin-Wall-Clock → korrekter
 * UTC-Instant (DST-sicher via berlinWallClockToUtc). matchType='nach' (kein Wunsch-Ranking).
 */
export function generischeDeadPinSlots(jetzt: Date = new Date()): SlotVorschlag[] {
  const slots: SlotVorschlag[] = []
  for (let tag = 0; tag < FALLBACK_FENSTER_TAGE && slots.length < MAX_SLOTS; tag++) {
    const d = new Date(jetzt)
    d.setUTCDate(d.getUTCDate() + tag)
    if (d.getUTCDay() === 0) continue // Sonntag aus
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const da = String(d.getUTCDate()).padStart(2, '0')
    for (const h of SLOT_STUNDEN) {
      if (slots.length >= MAX_SLOTS) break
      let startIso: string
      try {
        startIso = berlinWallClockToUtc(`${y}-${mo}-${da}T${String(h).padStart(2, '0')}:00`)
      } catch {
        continue
      }
      if (new Date(startIso).getTime() <= jetzt.getTime()) continue // vergangene raus
      const endIso = new Date(new Date(startIso).getTime() + TERMIN_DAUER_MIN * 60_000).toISOString()
      slots.push({ start: startIso, end: endIso, matchType: 'nach' })
    }
  }
  return slots
}

type SvLeadGeoRow = {
  id: string
  ort: string | null
  lat: number
  lng: number
  isochrone_polygon: unknown
  paket_umkreis_km: number | null
}

/**
 * Dead-Pin-Fallback: sv_leads, deren Isochrone (sonst Umkreis) den Ort abdeckt.
 * Leak-safe — NUR ort + Geo + gerundete Distanz + generische Slots (kein name/firma/
 * adresse). Aufzurufen NUR wenn 0 Partner (onKeinMatch). Naechste zuerst, max MAX_DEAD_PINS.
 */
export const ladeDeadPinFallback: LadeDeadPinFallback = async ({ lat, lng }) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
  const db = createAdminClient()
  const { data, error } = await db
    .from('sv_leads')
    .select('id, ort, lat, lng, isochrone_polygon, paket_umkreis_km')
    .eq('ist_aktiv', true)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
  if (error) {
    console.error('[ladeDeadPinFallback] sv_leads:', error.message)
    return []
  }

  const slots = generischeDeadPinSlots()
  const treffer: Array<DeadPinOeffentlich & { _km: number }> = []
  for (const row of (data ?? []) as SvLeadGeoRow[]) {
    const distanzKm = haversineKm(lat, lng, row.lat, row.lng)
    const polygon = parseIsochrone(row.isochrone_polygon)
    const deckt =
      polygon && polygon.length >= 3
        ? pointInPolygon([lng, lat], polygon)
        : distanzKm <= (row.paket_umkreis_km ?? DEFAULT_UMKREIS_KM)
    if (!deckt) continue
    treffer.push({
      deadPinId: row.id,
      ort: row.ort,
      distanzGerundet: rundeDistanz(distanzKm),
      lat: row.lat,
      lng: row.lng,
      slots,
      istDeadPin: true,
      _km: distanzKm,
    })
  }
  treffer.sort((a, b) => a._km - b._km)
  return treffer.slice(0, MAX_DEAD_PINS).map(({ _km, ...rest }) => rest)
}
