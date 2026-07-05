import { createAdminClient } from '@/lib/supabase/admin'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import type { TagesRoute, LiveOpsScope } from './types'

type StopRow = {
  id: string
  assignee_id: string | null
  fall_id: string | null
  start_zeit: string
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  gps_lat_ankunft: number | null
  gps_lng_ankunft: number | null
}

type SvProfileRow = {
  id: string
  vorname: string | null
  nachname: string | null
}

/**
 * Tagesrouten pro SV: alle heutigen Termine (Berlin-Tagesgrenze) nach start_zeit asc,
 * pro Termin Ziel-Koordinaten (GPS-Ankunft > besichtigungsort_lat/lng).
 * Termine ohne Geo werden uebersprungen. Nur SVs mit >= 1 heutigem Termin.
 */
export async function getTagesrouten(scope: LiveOpsScope): Promise<TagesRoute[]> {
  if (Array.isArray(scope.svIds) && scope.svIds.length === 0) return []

  const supabase = createAdminClient()

  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const startOfDay = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`)).toISOString()
  const endOfDay = new Date(berlinWallClockToUtc(`${berlinDateStr}T23:59:59`)).toISOString()

  let query = supabase
    .from('gutachter_termine')
    .select(
      'id, assignee_id, fall_id, start_zeit, besichtigungsort_lat, besichtigungsort_lng, gps_lat_ankunft, gps_lng_ankunft',
    )
    .eq('assignee_typ', 'sachverstaendiger')
    .gte('start_zeit', startOfDay)
    .lte('start_zeit', endOfDay)
    .order('start_zeit', { ascending: true })
    .limit(500)

  if (scope.svIds !== 'all') {
    query = query.in('assignee_id', scope.svIds)
  }

  // KB: nur Termine aus eigenen Faellen — verhindert, dass geteilte SVs Tagesrouten anderer KBs zeigen
  if (scope.fallIds !== 'all') {
    if (scope.fallIds.length === 0) return []
    query = query.in('fall_id', scope.fallIds)
  }

  const { data, error } = await query
  if (error) {
    console.error('[getTagesrouten] gutachter_termine query failed', error)
    return []
  }

  // Group stops by SV
  const stopsBySv = new Map<string, StopRow[]>()
  for (const raw of (data ?? []) as unknown as StopRow[]) {
    if (!raw.assignee_id) continue

    // Resolve geo: GPS-arrival > besichtigungsort_lat/lng
    let lat: number | null = null
    let lng: number | null = null
    if (typeof raw.gps_lat_ankunft === 'number' && typeof raw.gps_lng_ankunft === 'number') {
      lat = raw.gps_lat_ankunft
      lng = raw.gps_lng_ankunft
    } else if (typeof raw.besichtigungsort_lat === 'number' && typeof raw.besichtigungsort_lng === 'number') {
      lat = raw.besichtigungsort_lat
      lng = raw.besichtigungsort_lng
    }

    // Skip stops without any geo
    if (lat == null || lng == null) continue

    const existing = stopsBySv.get(raw.assignee_id) ?? []
    existing.push({ ...raw, besichtigungsort_lat: lat, besichtigungsort_lng: lng })
    stopsBySv.set(raw.assignee_id, existing)
  }

  if (stopsBySv.size === 0) return []

  // Load SV names in one batch query
  const svIds = Array.from(stopsBySv.keys())
  const svNameMap = new Map<string, string>()
  const { data: svRows } = await supabase
    .from('sachverstaendige')
    .select('id, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
    .in('id', svIds)

  for (const sv of (svRows ?? []) as unknown as Array<{
    id: string
    profile?: SvProfileRow | SvProfileRow[] | null
  }>) {
    const p = Array.isArray(sv.profile) ? sv.profile[0] : sv.profile
    if (p) {
      svNameMap.set(sv.id, [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Unbekannt')
    }
  }

  const routes: TagesRoute[] = []
  for (const [svId, stops] of stopsBySv) {
    routes.push({
      svId,
      svName: svNameMap.get(svId) ?? 'Unbekannt',
      stops: stops.map((stop, idx) => ({
        terminId: stop.id,
        lat: stop.besichtigungsort_lat as number,
        lng: stop.besichtigungsort_lng as number,
        startZeit: stop.start_zeit,
        reihenfolge: idx + 1,
      })),
    })
  }

  return routes
}
