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
        plz: lead.kunde_plz ?? lead.halter_plz,
        ort: lead.kunde_stadt ?? lead.halter_stadt,
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
        plz: lead.kunde_plz ?? lead.halter_plz,
        ort: lead.kunde_stadt ?? lead.halter_stadt,
        lat: lead.unfallort_lat,
        lng: lead.unfallort_lng,
        geoSource: 'unfallort',
      },
    }
  }

  const plzCandidate = lead.kunde_plz ?? lead.halter_plz
  if (plzCandidate) {
    const hit = plzMap.get(plzCandidate)
    if (hit) {
      return {
        kind: 'pin',
        pin: {
          ...baseFields,
          plz: plzCandidate,
          ort: hit.ort ?? lead.kunde_stadt ?? lead.halter_stadt,
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
      plz: lead.kunde_plz ?? lead.halter_plz,
    },
  }
}

/**
 * Lädt alle Leads im Triage-Backlog für die Dispatcher-Karte.
 *
 * Für v1 = Leads die noch nicht zu einem Fall konvertiert sind und nicht
 * disqualifiziert wurden. Das deckt den Haupt-Backlog: Neue Leads die noch
 * dispatcht werden müssen. Konvertierte Leads (Fall mit SV-Zuweisung) und
 * die "SV hat abgelehnt, zurück in Dispatch"-Fälle werden via Fall-View
 * gehandhabt und sind v2.
 *
 * Resolved Geo via Hybrid-Strategie (siehe resolveLeadGeo).
 */
export async function getTriageLeads(
  supabase: SupabaseClient<Database>,
): Promise<TriageSnapshot> {
  // 1) Leads (nicht disqualifiziert, nicht konvertiert).
  const { data: leads, error: lErr } = await supabase
    .from('leads')
    .select(
      `id, vorname, nachname, firma_name, schadentyp,
       besichtigungsort_lat, besichtigungsort_lng,
       unfallort_lat, unfallort_lng,
       kunde_plz, kunde_stadt, halter_plz, halter_stadt, created_at,
       disqualifiziert, konvertiert_zu_fall_id`,
    )
    .or('disqualifiziert.is.null,disqualifiziert.eq.false')
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (lErr) {
    console.error('[karte] leads query failed', lErr)
    return { pins: [], unlocalized: [] }
  }

  // 2) PLZ-Map laden. `ort` ist seit AAR-894 in der DB, aber noch nicht in
  // den generierten Typen → über expliziten Select-String + Row-Cast holen.
  // AAR-912: paginiert (Supabase PostgREST cappt bei 1000 pro Page; plz_geo
  // hat ~10.823 Einträge → ohne Pagination fallen Leads mit hoher PLZ in
  // unlocalized).
  type PlzRowWithOrt = { plz: string; lat: number; lng: number; ort?: string | null }
  const PAGE = 1000
  let plzRows: PlzRowWithOrt[] = []
  let pErr: { message: string } | null = null
  for (let page = 0; page < 15; page++) {
    const res = await supabase
      .from('plz_geo')
      .select('plz, lat, lng, ort' as 'plz, lat, lng')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (res.error) {
      pErr = res.error
      break
    }
    const chunk = (res.data ?? []) as unknown as PlzRowWithOrt[]
    plzRows = plzRows.concat(chunk)
    if (chunk.length < PAGE) break
  }

  if (pErr) {
    console.error('[karte] plz_geo query failed', pErr)
  }
  const plzMap = new Map<string, PlzGeoRow>(
    plzRows.map((r) => [
      r.plz,
      {
        plz: r.plz,
        lat: Number(r.lat),
        lng: Number(r.lng),
        ort: r.ort ?? null,
      },
    ]),
  )

  // 3) Resolve jedes Lead.
  const pins: TriageLeadPin[] = []
  const unlocalized: UnlocalizedLead[] = []
  for (const lead of (leads ?? []) as RawLeadForKarte[]) {
    const result = resolveLeadGeo(lead, plzMap)
    if (result.kind === 'pin') pins.push(result.pin)
    else unlocalized.push(result.lead)
  }

  return { pins, unlocalized }
}
