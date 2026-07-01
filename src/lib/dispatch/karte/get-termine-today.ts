import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PlzGeoRow, RawTerminForKarte, TerminPin, UnlocalizedLead } from './types'
import { resolveTerminGeo } from './resolve-termin-geo'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

// Schema-Hinweis: sachverstaendige hat KEIN vorname/nachname — wir joinen
// über profile_id → profiles. Lead-Felder + besichtigungsort_lat/lng liegen
// direkt auf leads. claims.claim_nummer (via faelle.claim_id) für Anzeige.
export async function getTermineToday(
  supabase: SupabaseClient<Database>,
  plzMap: Map<string, PlzGeoRow>,
): Promise<{ pins: TerminPin[]; unlocalized: UnlocalizedLead[] }> {
  // Berlin-Tagesgrenze statt Server-lokal (= UTC auf Vercel -> "heute" war am
  // Tagesrand 1-2h schief). Analog dispatch/dashboard (#3317, AAR-958):
  // berlinWallClockToUtc ist das etablierte Helfer-Pattern.
  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const startOfDay = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`)).toISOString()
  const endOfDay = new Date(berlinWallClockToUtc(`${berlinDateStr}T23:59:59`)).toISOString()

  const { data, error } = await supabase
    .from('gutachter_termine')
    .select(
      `id, start_zeit, status, fall_id, lead_id, assignee_id, assignee_typ,
       gps_lat_ankunft, gps_lng_ankunft,
       lead:leads!gutachter_termine_lead_id_fkey(vorname, nachname, besichtigungsort_lat, besichtigungsort_lng, kunde_plz, halter_plz),
       fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(claims:claim_id(claim_nummer))`,
    )
    .gte('start_zeit', startOfDay)
    .lte('start_zeit', endOfDay)
    .limit(500)

  if (error) {
    console.error('[karte] gutachter_termine query failed', error)
    return { pins: [], unlocalized: [] }
  }

  type EmbeddedLead = {
    vorname: string | null
    nachname: string | null
    besichtigungsort_lat: number | null
    besichtigungsort_lng: number | null
    kunde_plz: string | null
    halter_plz: string | null
  }
  type EmbeddedProfile = { vorname: string | null; nachname: string | null }
  type EmbeddedSv = {
    standort_lat: number | null
    standort_lng: number | null
    profile?: EmbeddedProfile | EmbeddedProfile[] | null
  }
  type EmbeddedClaim = { claim_nummer: string | null }
  type EmbeddedFall = { claims?: EmbeddedClaim | EmbeddedClaim[] | null }
  type Row = {
    id: string
    start_zeit: string
    status: string | null
    fall_id: string | null
    lead_id: string | null
    assignee_id: string | null
    assignee_typ: string | null
    gps_lat_ankunft: number | null
    gps_lng_ankunft: number | null
    lead?: EmbeddedLead | EmbeddedLead[] | null
    fall?: EmbeddedFall | EmbeddedFall[] | null
  }

  // CMM-49 sv_id-Drop: der FK-Embed sv:sachverstaendige(...) haengt an der zu
  // droppenden sv_id-FK → assignee_id-Lookup (typ-guarded, value-identisch).
  // Map assignee_id (= SV-id) -> SV-Geo + Profil-Name.
  const svAssigneeIds = Array.from(
    new Set(
      ((data ?? []) as unknown as Row[])
        .filter((r) => r.assignee_typ === 'sachverstaendiger' && r.assignee_id)
        .map((r) => r.assignee_id as string),
    ),
  )
  const svMap = new Map<string, EmbeddedSv>()
  if (svAssigneeIds.length > 0) {
    const { data: svRows } = await supabase
      .from('sachverstaendige')
      .select('id, standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
      .in('id', svAssigneeIds)
    for (const s of (svRows ?? []) as unknown as Array<{ id: string } & EmbeddedSv>) {
      svMap.set(s.id, { standort_lat: s.standort_lat, standort_lng: s.standort_lng, profile: s.profile })
    }
  }

  const pins: TerminPin[] = []
  const unlocalized: UnlocalizedLead[] = []

  for (const raw of ((data ?? []) as unknown as Row[])) {
    const lead = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead
    const sv = raw.assignee_typ === 'sachverstaendiger' && raw.assignee_id ? svMap.get(raw.assignee_id) ?? null : null
    const fall = Array.isArray(raw.fall) ? raw.fall[0] : raw.fall
    const fallClaim = fall ? (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims) : null
    const svProfile = sv
      ? Array.isArray(sv.profile)
        ? sv.profile[0]
        : sv.profile
      : null

    const flat: RawTerminForKarte = {
      id: raw.id,
      start_zeit: raw.start_zeit,
      status: raw.status,
      fall_id: raw.fall_id,
      lead_id: raw.lead_id,
      sv_id: raw.assignee_typ === 'sachverstaendiger' ? raw.assignee_id : null,
      gps_lat_ankunft: raw.gps_lat_ankunft,
      gps_lng_ankunft: raw.gps_lng_ankunft,
      lead_lat: lead?.besichtigungsort_lat ?? null,
      lead_lng: lead?.besichtigungsort_lng ?? null,
      lead_vorname: lead?.vorname ?? null,
      lead_nachname: lead?.nachname ?? null,
      sv_lat: sv?.standort_lat ?? null,
      sv_lng: sv?.standort_lng ?? null,
      sv_vorname: svProfile?.vorname ?? null,
      sv_nachname: svProfile?.nachname ?? null,
      claim_nummer: fallClaim?.claim_nummer ?? null,
    }

    const leadPlz = lead?.kunde_plz ?? lead?.halter_plz ?? null
    const res = resolveTerminGeo(flat, plzMap, leadPlz)
    if (res.kind === 'pin') pins.push(res.pin)
    else unlocalized.push(res.lead)
  }

  return { pins, unlocalized }
}
