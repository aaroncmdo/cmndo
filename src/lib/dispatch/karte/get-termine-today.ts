import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PlzGeoRow, RawTerminForKarte, TerminPin, UnlocalizedLead } from './types'
import { resolveTerminGeo } from './resolve-termin-geo'

// Schema-Hinweis: sachverstaendige hat KEIN vorname/nachname — wir joinen
// über profile_id → profiles. Lead-Felder + besichtigungsort_lat/lng liegen
// direkt auf leads. faelle.fall_nummer für Anzeige.
export async function getTermineToday(
  supabase: SupabaseClient<Database>,
  plzMap: Map<string, PlzGeoRow>,
): Promise<{ pins: TerminPin[]; unlocalized: UnlocalizedLead[] }> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

  const { data, error } = await supabase
    .from('gutachter_termine')
    .select(
      `id, start_zeit, status, fall_id, lead_id, sv_id,
       gps_lat_ankunft, gps_lng_ankunft,
       lead:leads(vorname, nachname, besichtigungsort_lat, besichtigungsort_lng, kunde_plz, halter_plz),
       sv:sachverstaendige(standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname)),
       fall:faelle(fall_nummer)`,
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
  type EmbeddedFall = { fall_nummer: string | null }
  type Row = {
    id: string
    start_zeit: string
    status: string | null
    fall_id: string | null
    lead_id: string | null
    sv_id: string | null
    gps_lat_ankunft: number | null
    gps_lng_ankunft: number | null
    lead?: EmbeddedLead | EmbeddedLead[] | null
    sv?: EmbeddedSv | EmbeddedSv[] | null
    fall?: EmbeddedFall | EmbeddedFall[] | null
  }

  const pins: TerminPin[] = []
  const unlocalized: UnlocalizedLead[] = []

  for (const raw of ((data ?? []) as unknown as Row[])) {
    const lead = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead
    const sv = Array.isArray(raw.sv) ? raw.sv[0] : raw.sv
    const fall = Array.isArray(raw.fall) ? raw.fall[0] : raw.fall
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
      sv_id: raw.sv_id,
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
      fall_nummer: fall?.fall_nummer ?? null,
    }

    const leadPlz = lead?.kunde_plz ?? lead?.halter_plz ?? null
    const res = resolveTerminGeo(flat, plzMap, leadPlz)
    if (res.kind === 'pin') pins.push(res.pin)
    else unlocalized.push(res.lead)
  }

  return { pins, unlocalized }
}
