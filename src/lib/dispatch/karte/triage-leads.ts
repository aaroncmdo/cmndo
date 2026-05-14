import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type {
  PlzGeoRow,
  RawLeadForKarte,
  TriageLeadPin,
  TriageSnapshot,
  UnlocalizedLead,
} from './types'

type ResolveResult =
  | { kind: 'pin'; pin: TriageLeadPin }
  | { kind: 'unlocalized'; lead: UnlocalizedLead }

export function resolveLeadGeo(
  lead: RawLeadForKarte,
  plzMap: Map<string, PlzGeoRow>,
): ResolveResult {
  const baseFields = {
    id: lead.id,
    vorname: lead.vorname,
    nachname: lead.nachname,
    firma_name: lead.firma_name,
    schadentyp: lead.schadentyp,
    created_at: lead.created_at ?? new Date(0).toISOString(),
  }

  if (
    typeof lead.besichtigungsort_lat === 'number' &&
    typeof lead.besichtigungsort_lng === 'number'
  ) {
    return {
      kind: 'pin',
      pin: {
        ...baseFields,
        plz: lead.besichtigungsort_plz,
        ort: lead.besichtigungsort_stadt,
        lat: lead.besichtigungsort_lat,
        lng: lead.besichtigungsort_lng,
        geoSource: 'besichtigungsort',
      },
    }
  }

  if (
    typeof lead.unfallort_lat === 'number' &&
    typeof lead.unfallort_lng === 'number'
  ) {
    return {
      kind: 'pin',
      pin: {
        ...baseFields,
        plz: lead.unfallort_plz ?? lead.besichtigungsort_plz,
        ort: lead.besichtigungsort_stadt,
        lat: lead.unfallort_lat,
        lng: lead.unfallort_lng,
        geoSource: 'unfallort',
      },
    }
  }

  const plzCandidate =
    lead.besichtigungsort_plz ?? lead.unfallort_plz ?? lead.kunde_plz
  if (plzCandidate) {
    const hit = plzMap.get(plzCandidate)
    if (hit) {
      return {
        kind: 'pin',
        pin: {
          ...baseFields,
          plz: plzCandidate,
          ort: hit.ort ?? lead.besichtigungsort_stadt ?? lead.kunde_stadt,
          lat: hit.lat,
          lng: hit.lng,
          geoSource: 'plz_centroid',
        },
      }
    }
  }

  return {
    kind: 'unlocalized',
    lead: {
      ...baseFields,
      plz: lead.besichtigungsort_plz ?? lead.unfallort_plz ?? lead.kunde_plz,
    },
  }
}

const ACTIVE_AUFTRAG_STATES_TO_EXCLUDE = [
  'storniert',
  'abgelehnt',
  'abgesagt',
  'no_show',
] as const

/**
 * Lädt alle Leads im Triage-Backlog (kein aktiver Auftrag) für die
 * Dispatcher-Karte. Resolved Geo via Hybrid-Strategie.
 */
export async function getTriageLeads(
  supabase: SupabaseClient<Database>,
): Promise<TriageSnapshot> {
  // 1) Lead-IDs mit AKTIVEM Auftrag (= NOT in Triage-Backlog).
  // Hinweis: auftraege.lead_id existiert in der DB, aber noch nicht in den
  // generierten Typen → expliziter any-Cast für die Abfrage.
  const excludeFilter = `(${ACTIVE_AUFTRAG_STATES_TO_EXCLUDE
    .map((s) => `"${s}"`)
    .join(',')})`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auftraegeQuery = (supabase as any)
    .from('auftraege')
    .select('lead_id, status')
    .not('lead_id', 'is', null)
    .not('status', 'in', excludeFilter)

  const { data: activeAuftraege, error: aErr } = await auftraegeQuery

  if (aErr) {
    console.error('[karte] auftraege query failed', aErr)
    return { pins: [], unlocalized: [] }
  }
  const blockedLeadIds = new Set(
    ((activeAuftraege ?? []) as Array<{ lead_id: string | null; status: string }>)
      .map((row) => row.lead_id)
      .filter((id): id is string => !!id),
  )

  // 2) Leads (nicht disqualifiziert, nicht konvertiert).
  // besichtigungsort_plz, besichtigungsort_stadt, unfallort_plz existieren in der DB,
  // sind aber noch nicht in den generierten Typen → expliziter any-Cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadsQuery = (supabase as any)
    .from('leads')
    .select(
      `id, vorname, nachname, firma_name, schadentyp,
       besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_plz, besichtigungsort_stadt,
       unfallort_lat, unfallort_lng, unfallort_plz,
       kunde_plz, kunde_stadt, created_at,
       disqualifiziert, konvertiert_zu_fall_id`,
    )
    .or('disqualifiziert.is.null,disqualifiziert.eq.false')
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: leads, error: lErr } = await leadsQuery

  if (lErr) {
    console.error('[karte] leads query failed', lErr)
    return { pins: [], unlocalized: [] }
  }

  const triageLeads = ((leads ?? []) as RawLeadForKarte[]).filter(
    (l) => !blockedLeadIds.has(l.id),
  )

  // 3) PLZ-Map laden.
  const { data: plzRows, error: pErr } = await supabase
    .from('plz_geo')
    .select('plz, lat, lng')

  if (pErr) {
    console.error('[karte] plz_geo query failed', pErr)
  }
  const plzMap = new Map(
    (plzRows ?? []).map((r) => [
      r.plz,
      // ort ist in der DB vorhanden, aber noch nicht in den generierten Typen
      { plz: r.plz, lat: Number(r.lat), lng: Number(r.lng), ort: null as string | null },
    ]),
  )

  // 4) Resolve jedes Lead.
  const pins: TriageLeadPin[] = []
  const unlocalized: UnlocalizedLead[] = []
  for (const lead of triageLeads) {
    const result = resolveLeadGeo(lead, plzMap)
    if (result.kind === 'pin') pins.push(result.pin)
    else unlocalized.push(result.lead)
  }

  return { pins, unlocalized }
}
