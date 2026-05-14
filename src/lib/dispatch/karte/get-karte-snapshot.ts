import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { KarteSnapshot, PlzGeoRow } from './types'
import { getTriageLeads } from './triage-leads'
import { getActiveSVs } from './get-active-svs'
import { getTermineToday } from './get-termine-today'

// PLZ-Map einmal lesen — getActiveSVs (für ort-Lookup) und getTermineToday
// (für plz_centroid-Fallback) teilen sie sich. getTriageLeads lädt seinen
// eigenen plz_geo (Legacy-API von AAR-894).
async function loadPlzMap(supabase: SupabaseClient<Database>): Promise<Map<string, PlzGeoRow>> {
  type PlzRowWithOrt = { plz: string; lat: number; lng: number; ort?: string | null }
  const { data, error } = await supabase
    .from('plz_geo')
    .select('plz, lat, lng, ort' as 'plz, lat, lng')
  if (error) {
    console.error('[karte] plz_geo query failed', error)
    return new Map()
  }
  return new Map<string, PlzGeoRow>(
    ((data ?? []) as unknown as PlzRowWithOrt[]).map((r) => [
      r.plz,
      { plz: r.plz, lat: Number(r.lat), lng: Number(r.lng), ort: r.ort ?? null },
    ]),
  )
}

export async function getKarteSnapshot(
  supabase: SupabaseClient<Database>,
): Promise<KarteSnapshot> {
  const plzMap = await loadPlzMap(supabase)

  // Sequenziell — Parallel-Run führte zu 25P02 cascading transaction-aborts,
  // weil supabase-js die Connection zwischen Promise.all-Calls teilt und ein
  // Fehler in einem Query alle anderen poisoned. Bei drei Tabellen-Reads ist
  // der Performance-Hit klein, aber das Debug-Bild ist viel sauberer.
  const leadsSnapshot = await getTriageLeads(supabase)
  const svs = await getActiveSVs(supabase, plzMap)
  const termineResult = await getTermineToday(supabase, plzMap)

  return {
    leads: leadsSnapshot.pins,
    svs,
    termine: termineResult.pins,
    unlocalized: [...leadsSnapshot.unlocalized, ...termineResult.unlocalized],
  }
}
