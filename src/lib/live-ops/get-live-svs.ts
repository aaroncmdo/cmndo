import { createAdminClient } from '@/lib/supabase/admin'
import { deriveCarState } from './car-state'
import type { SvLiveOps, LiveOpsScope } from './types'

// ---------- local row types (not exported) ----------

type SvRow = {
  id: string
  gutachter_typ: string
  verifiziert: boolean
  paket: string
  paket_faelle_genutzt: number | null
  paket_faelle_gesamt: number | null
  standort_lat: number | null
  standort_lng: number | null
  isochrone_polygon: unknown | null
  portal_zugang_freigeschaltet: boolean
  gesperrt_seit: string | null
  urlaub_von: string | null
  urlaub_bis: string | null
  live_tracking_enabled: boolean
  vorname: string | null
  nachname: string | null
  avatar_url: string | null
  live_lat: number | null
  live_lng: number | null
  live_updated_at: string | null
  live_heading: number | null
}

type TerminRow = {
  id: string
  assignee_id: string
  assignee_typ: string
  status: string
  start_zeit: string
  losgefahren_am: string | null
  sv_unterwegs_seit: string | null
  sv_eta_minuten: number | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
}

// ---------- pure mapper (exported for tests) ----------

export function mapSvRow(row: SvRow, aktiverTermin: TerminRow | null, nowMs: number): SvLiveOps {
  const liveInput =
    row.live_lat != null && row.live_lng != null && row.live_updated_at != null
      ? {
          lat: row.live_lat,
          lng: row.live_lng,
          heading: row.live_heading,
          updatedAtMs: new Date(row.live_updated_at).getTime(),
        }
      : null

  const terminInput = aktiverTermin
    ? {
        id: aktiverTermin.id,
        status: aktiverTermin.status,
        losgefahrenAtMs: aktiverTermin.losgefahren_am
          ? new Date(aktiverTermin.losgefahren_am).getTime()
          : null,
        svUnterwegsSeitMs: aktiverTermin.sv_unterwegs_seit
          ? new Date(aktiverTermin.sv_unterwegs_seit).getTime()
          : null,
        zielLat: aktiverTermin.besichtigungsort_lat,
        zielLng: aktiverTermin.besichtigungsort_lng,
        etaMinuten: aktiverTermin.sv_eta_minuten,
      }
    : null

  return {
    id: row.id,
    name: [row.vorname, row.nachname].filter(Boolean).join(' ') || 'Unbekannt',
    typ: row.gutachter_typ,
    verifiziert: row.verifiziert,
    paket: row.paket,
    genutzt: row.paket_faelle_genutzt ?? 0,
    gesamt: row.paket_faelle_gesamt ?? 0,
    gesperrt: row.gesperrt_seit != null,
    urlaub: row.urlaub_von != null,
    standortLat: row.standort_lat,
    standortLng: row.standort_lng,
    isochrone: row.isochrone_polygon,
    car: deriveCarState({ nowMs, live: liveInput, aktiverTermin: terminInput }),
  }
}

// ---------- active statuses for Termin lookup ----------

const AKTIVE_STATUSES = ['reserviert', 'bestaetigt', 'unterwegs', 'losgefahren']

// ---------- DB adapter ----------

export async function getLiveOpsSvs(scope: LiveOpsScope): Promise<SvLiveOps[]> {
  // Early-out for empty explicit list
  if (Array.isArray(scope.svIds) && scope.svIds.length === 0) return []

  const supabase = createAdminClient()

  // 1. Load SVs from view
  let svQuery = supabase.from('v_live_ops_sv').select('*')
  if (scope.svIds !== 'all') {
    svQuery = svQuery.in('id', scope.svIds)
  }

  const { data: svRows, error: svError } = await svQuery
  if (svError) {
    console.error('[getLiveOpsSvs] v_live_ops_sv query failed', svError)
    return []
  }
  if (!svRows || svRows.length === 0) return []

  const svIds = svRows.map((r) => r.id as string)
  const cutoffIso = new Date(Date.now() - 12 * 3600_000).toISOString()

  // 2. Load active Termine for those SVs
  const { data: terminRows, error: terminError } = await supabase
    .from('gutachter_termine')
    .select(
      'id, assignee_id, assignee_typ, status, start_zeit, losgefahren_am, sv_unterwegs_seit, sv_eta_minuten, besichtigungsort_lat, besichtigungsort_lng',
    )
    .eq('assignee_typ', 'sachverstaendiger')
    .in('assignee_id', svIds)
    .in('status', AKTIVE_STATUSES)
    .gte('start_zeit', cutoffIso)
    .order('start_zeit', { ascending: true })

  if (terminError) {
    console.error('[getLiveOpsSvs] gutachter_termine query failed', terminError)
    // Non-fatal: continue without termine
  }

  // 3. Build Map<svId, best TerminRow>
  // Priority: (1) unterwegs/losgefahren, (2) earliest remaining
  const terminMap = new Map<string, TerminRow>()
  for (const t of (terminRows ?? []) as TerminRow[]) {
    const existing = terminMap.get(t.assignee_id)
    if (!existing) {
      terminMap.set(t.assignee_id, t)
      continue
    }
    const tIsActive = t.status === 'unterwegs' || t.status === 'losgefahren'
    const exIsActive = existing.status === 'unterwegs' || existing.status === 'losgefahren'
    if (tIsActive && !exIsActive) {
      // Prefer active over non-active
      terminMap.set(t.assignee_id, t)
    }
    // If both active or both non-active: keep first (already sorted asc by start_zeit)
  }

  // 4. Map rows
  const now = Date.now()
  return (svRows as SvRow[]).map((row) =>
    mapSvRow(row, terminMap.get(row.id) ?? null, now),
  )
}
