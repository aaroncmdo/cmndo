import { createAdminClient } from '@/lib/supabase/admin'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { bezugInExpr } from '@/lib/termine/bezug-filter'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'
import type { LatLng } from '@/lib/mapbox/matrix'
import type { TerminPin, LiveOpsScope } from './types'

// Statuses that are NOT considered "offen" (abgeschlossen/storniert)
const ABGESCHLOSSEN_STATUSES = ['abgeschlossen', 'storniert', 'cancelled']

type SvProfileRow = {
  id: string
  vorname: string | null
  nachname: string | null
}

type SvRow = {
  id: string
  standort_lat: number | null
  standort_lng: number | null
  profile?: SvProfileRow | SvProfileRow[] | null
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
       fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(claims!fk_bridge_claim(claim_nummer))`,
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
    query = query.or(bezugInExpr('fall', scope.fallIds))
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
  const svStandortMap = new Map<string, LatLng>()
  if (svAssigneeIds.length > 0) {
    const { data: svRows } = await supabase
      .from('sachverstaendige')
      .select('id, standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
      .in('id', svAssigneeIds)

    for (const sv of (svRows ?? []) as unknown as SvRow[]) {
      const p = Array.isArray(sv.profile) ? sv.profile[0] : sv.profile
      if (p) {
        svNameMap.set(sv.id, [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Unbekannt')
      }
      if (typeof sv.standort_lat === 'number' && typeof sv.standort_lng === 'number') {
        svStandortMap.set(sv.id, { lat: sv.standort_lat, lng: sv.standort_lng })
      }
    }
  }

  // Pre-compute ETA per Termin: gruppe Termine nach SV, rufe mapboxEtaMatrix je SV-Batch
  const terminEtaMap = new Map<string, number | null>()
  {
    // Zuerst geo-aufgeloeste Termine pro SV sammeln
    const svTerminLocs = new Map<string, Array<{ id: string; loc: LatLng }>>()
    for (const raw of (data ?? []) as unknown as TerminRow[]) {
      if (!raw.assignee_id) continue
      let lat: number | null = null
      let lng: number | null = null
      if (typeof raw.gps_lat_ankunft === 'number' && typeof raw.gps_lng_ankunft === 'number') {
        lat = raw.gps_lat_ankunft
        lng = raw.gps_lng_ankunft
      } else if (typeof raw.besichtigungsort_lat === 'number' && typeof raw.besichtigungsort_lng === 'number') {
        lat = raw.besichtigungsort_lat
        lng = raw.besichtigungsort_lng
      }
      if (lat == null || lng == null) continue
      const bucket = svTerminLocs.get(raw.assignee_id) ?? []
      bucket.push({ id: raw.id, loc: { lat, lng } })
      svTerminLocs.set(raw.assignee_id, bucket)
    }

    // Je SV mit bekanntem Standort: Matrix-API parallel aufrufen. Die SV-Buckets
    // sind voneinander unabhaengig -> Promise.all statt sequenzieller Round-Trips.
    // Jedes Promise traegt seine eigenen `entries` mit, damit die etas[i]<->entries[i]-
    // Zuordnung strikt bucket-lokal bleibt (keine Vermischung zwischen SVs).
    const svBatches = Array.from(svTerminLocs.entries())
      .filter(([svId]) => svStandortMap.has(svId))
      .map(([svId, entries]) => {
        const standort = svStandortMap.get(svId) as LatLng
        return mapboxEtaMatrix(standort, entries.map((e) => e.loc))
          .then((etas) => ({ entries, etas }))
          .catch((err) => {
            console.warn('[getOffeneTermine] mapboxEtaMatrix fehlgeschlagen fuer SV', svId, err)
            return { entries, etas: entries.map(() => null) as Array<number | null> }
          })
      })

    // SVs ohne Standort direkt auf null setzen (kein Matrix-Call noetig)
    for (const [svId, entries] of svTerminLocs.entries()) {
      if (!svStandortMap.has(svId)) {
        for (const e of entries) terminEtaMap.set(e.id, null)
      }
    }

    const settled = await Promise.all(svBatches)
    for (const { entries, etas } of settled) {
      for (let i = 0; i < entries.length; i++) {
        terminEtaMap.set(entries[i].id, etas[i] ?? null)
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
      etaMin: terminEtaMap.get(raw.id) ?? null,
    })
  }

  return pins
}
