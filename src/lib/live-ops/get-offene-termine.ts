import { createAdminClient } from '@/lib/supabase/admin'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import type { TerminPin, LiveOpsScope } from './types'

// Statuses that are NOT considered "offen" (abgeschlossen/storniert)
const ABGESCHLOSSEN_STATUSES = ['abgeschlossen', 'storniert', 'cancelled']

type SvProfileRow = {
  id: string
  vorname: string | null
  nachname: string | null
}

type LeadRow = {
  vorname: string | null
  nachname: string | null
}

type ClaimRow = {
  claim_nummer: string | null
}

type FallBridgeRow = {
  claims?: ClaimRow | ClaimRow[] | null
}

type TerminRow = {
  id: string
  assignee_id: string | null
  assignee_typ: string | null
  status: string | null
  start_zeit: string
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  gps_lat_ankunft: number | null
  gps_lng_ankunft: number | null
  lead_id: string | null
  fall_id: string | null
  lead?: LeadRow | LeadRow[] | null
  fall?: FallBridgeRow | FallBridgeRow[] | null
}

/**
 * Offene SV-Termine (Status NICHT abgeschlossen/storniert/cancelled),
 * assignee_typ=sachverstaendiger, heute und in der Zukunft.
 * Geo: gps_lat_ankunft > besichtigungsort_lat/lng (kein PLZ-Fallback noetig
 * weil Termine ohne Koordinaten einfach gedropt werden).
 */
export async function getOffeneTermine(scope: LiveOpsScope): Promise<TerminPin[]> {
  if (Array.isArray(scope.svIds) && scope.svIds.length === 0) return []

  const supabase = createAdminClient()

  // Berlin-Tagesgrenze: ab Beginn des heutigen Berliner Tages
  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const startOfToday = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`)).toISOString()

  let query = supabase
    .from('gutachter_termine')
    .select(
      `id, assignee_id, assignee_typ, status, start_zeit,
       besichtigungsort_lat, besichtigungsort_lng,
       gps_lat_ankunft, gps_lng_ankunft,
       lead_id, fall_id,
       lead:leads!gutachter_termine_lead_id_fkey(vorname, nachname),
       fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(claims:claim_id(claim_nummer))`,
    )
    .eq('assignee_typ', 'sachverstaendiger')
    .not('status', 'in', `(${ABGESCHLOSSEN_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .gte('start_zeit', startOfToday)
    .order('start_zeit', { ascending: true })
    .limit(500)

  if (scope.svIds !== 'all') {
    query = query.in('assignee_id', scope.svIds)
  }

  // KB: nur Termine aus eigenen Faellen — verhindert, dass geteilte SVs Termine anderer KBs zeigen
  if (scope.fallIds !== 'all') {
    if (scope.fallIds.length === 0) return []
    query = query.in('fall_id', scope.fallIds)
  }

  const { data, error } = await query
  if (error) {
    console.error('[getOffeneTermine] gutachter_termine query failed', error)
    return []
  }

  // Load SV names in one batch query
  const svAssigneeIds = Array.from(
    new Set(
      ((data ?? []) as unknown as TerminRow[])
        .filter((r) => r.assignee_id != null)
        .map((r) => r.assignee_id as string),
    ),
  )

  const svNameMap = new Map<string, string>()
  if (svAssigneeIds.length > 0) {
    const { data: svRows } = await supabase
      .from('sachverstaendige')
      .select('id, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
      .in('id', svAssigneeIds)

    for (const sv of (svRows ?? []) as unknown as Array<{
      id: string
      profile?: SvProfileRow | SvProfileRow[] | null
    }>) {
      const p = Array.isArray(sv.profile) ? sv.profile[0] : sv.profile
      if (p) {
        svNameMap.set(sv.id, [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Unbekannt')
      }
    }
  }

  const pins: TerminPin[] = []

  for (const raw of (data ?? []) as unknown as TerminRow[]) {
    if (!raw.assignee_id) continue

    // Resolve lat/lng: GPS-arrival takes priority, then besichtigungsort
    let lat: number | null = null
    let lng: number | null = null
    if (typeof raw.gps_lat_ankunft === 'number' && typeof raw.gps_lng_ankunft === 'number') {
      lat = raw.gps_lat_ankunft
      lng = raw.gps_lng_ankunft
    } else if (typeof raw.besichtigungsort_lat === 'number' && typeof raw.besichtigungsort_lng === 'number') {
      lat = raw.besichtigungsort_lat
      lng = raw.besichtigungsort_lng
    }

    // Skip Termine without any geo (no PLZ fallback for live-ops pins)
    if (lat == null || lng == null) continue

    const lead = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead
    const fall = Array.isArray(raw.fall) ? raw.fall[0] : raw.fall
    const claim = fall ? (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims) : null

    const kundeName = lead
      ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'
      : 'Unbekannt'

    pins.push({
      id: raw.id,
      svId: raw.assignee_id,
      svName: svNameMap.get(raw.assignee_id) ?? 'Unbekannt',
      kundeName,
      status: raw.status ?? 'unbekannt',
      startZeit: raw.start_zeit,
      lat,
      lng,
      adresse: '',
      claimNummer: claim?.claim_nummer ?? '',
      fallId: raw.fall_id ?? null,
    })
  }

  return pins
}
