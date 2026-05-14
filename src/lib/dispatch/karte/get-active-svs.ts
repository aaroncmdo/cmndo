import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PlzGeoRow, SVPin } from './types'

// Schema-Hinweis: `sachverstaendige` hat KEIN vorname/nachname (liegt auf `profiles`),
// KEIN bewertungs_durchschnitt/anzahl (liegt auf `google_bewertungen_cache`),
// KEIN stadt (wird aus `standort_plz` via plzMap aufgelöst).
// Pattern entspricht `ladeAktiveSVs()` in src/lib/actions/gutachter-finder-actions.ts.
export async function getActiveSVs(
  supabase: SupabaseClient<Database>,
  plzMap: Map<string, PlzGeoRow>,
): Promise<SVPin[]> {
  const { data: svRows, error: svErr } = await supabase
    .from('sachverstaendige')
    .select(
      'id, paket, profile_id, firmenname, spezifikationen, standort_lat, standort_lng, standort_plz',
    )
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)

  if (svErr) {
    console.error('[karte] sachverstaendige query failed', svErr)
    return []
  }
  if (!svRows || svRows.length === 0) return []

  const profileIds = Array.from(
    new Set(svRows.map((r) => r.profile_id).filter((id): id is string => typeof id === 'string')),
  )

  const profileById = new Map<string, { vorname: string | null; nachname: string | null }>()
  const bewById = new Map<string, { durchschnitt: number | null; anzahl: number | null }>()

  if (profileIds.length > 0) {
    const [profilesRes, bewRes] = await Promise.all([
      supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds),
      supabase
        .from('google_bewertungen_cache')
        .select('profile_id, durchschnitt, anzahl_bewertungen')
        .in('profile_id', profileIds),
    ])
    if (profilesRes.data) {
      for (const p of profilesRes.data) {
        profileById.set(p.id, { vorname: p.vorname, nachname: p.nachname })
      }
    }
    if (bewRes.data) {
      for (const b of bewRes.data) {
        bewById.set(b.profile_id, {
          durchschnitt: b.durchschnitt,
          anzahl: b.anzahl_bewertungen,
        })
      }
    }
  }

  const pins: SVPin[] = []
  for (const sv of svRows) {
    if (typeof sv.standort_lat !== 'number' || typeof sv.standort_lng !== 'number') continue
    const profile = sv.profile_id ? profileById.get(sv.profile_id) ?? null : null
    const bew = sv.profile_id ? bewById.get(sv.profile_id) ?? null : null
    const ort = sv.standort_plz ? plzMap.get(sv.standort_plz)?.ort ?? null : null
    const specs = Array.isArray(sv.spezifikationen) ? (sv.spezifikationen as string[]) : []
    pins.push({
      id: sv.id,
      vorname: profile?.vorname ?? null,
      nachname: profile?.nachname ?? null,
      firmenname: sv.firmenname,
      paket: sv.paket,
      ort,
      spezifikationen_top3: specs.slice(0, 3),
      bewertungs_durchschnitt: bew?.durchschnitt ?? null,
      bewertungs_anzahl: bew?.anzahl ?? null,
      lat: sv.standort_lat,
      lng: sv.standort_lng,
    })
  }
  return pins
}
