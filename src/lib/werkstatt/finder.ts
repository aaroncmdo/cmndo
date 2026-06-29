// Geteilter Geo-Matching-Kern fuer den Werkstatt-Finder (Phase 1).
// Einfacher als der Gutachter-Finder: KEINE Isochrone, KEIN Wizard — nur eine
// nach Distanz rangierte Liste aktiver Partner-Werkstaetten zu einem Schadenort.
//
// rankWerkstaetten = pure (testbar ohne DB). findWerkstaetten liest die aktiven
// Werkstaetten via service-role-Admin-Client (Dispatcher/Admin braucht ALLE).

import { haversineKm } from '@/lib/gps/geofence'
import { createAdminClient } from '@/lib/supabase/admin'

export type WerkstattFinderRow = {
  id: string
  name: string
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  telefon: string | null
  lat: number | null
  lng: number | null
  status: string
  distanz_km: number
}

/** Status-Wert, der eine aktive (matchbare) Werkstatt markiert. */
const STATUS_AKTIV = 'aktiv'

/**
 * Pure: filtert auf aktive Werkstaetten, berechnet die Luftlinie zum Origin und
 * sortiert aufsteigend.
 *
 * Entscheidung no-lat/lng: Werkstaetten ohne Koordinaten werden NICHT
 * herausgefiltert, sondern mit distanz_km = Infinity ans Listenende geschoben.
 * So bleibt eine aktive Partner-Werkstatt mit fehlendem Geo (Stammdaten-Luecke)
 * fuer den Dispatcher sichtbar, statt stillschweigend zu verschwinden.
 */
export function rankWerkstaetten(
  rows: Array<Omit<WerkstattFinderRow, 'distanz_km'>>,
  origin: { lat: number; lng: number },
): WerkstattFinderRow[] {
  return rows
    .filter((r) => r.status === STATUS_AKTIV)
    .map((r) => ({
      ...r,
      distanz_km:
        r.lat !== null && r.lng !== null
          ? haversineKm(origin.lat, origin.lng, r.lat, r.lng)
          : Infinity,
    }))
    .sort((a, b) => a.distanz_km - b.distanz_km)
}

const SELECT_COLS = 'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status'

/**
 * Liest aktive Werkstaetten und gibt sie nach Distanz zum (lat/lng)-Origin
 * rangiert zurueck (Top-`limit`, default 10).
 *
 * Fallback: Fehlen lat/lng, ist aber eine plz gegeben, wird ohne Distanz nach
 * Name sortiert zurueckgegeben (MVP — echtes PLZ->Geo-Lookup ist Phase 2).
 * Fehlt beides, liefert die Funktion eine leere Liste (kein Origin = kein Ranking).
 */
export async function findWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
  limit?: number
}): Promise<WerkstattFinderRow[]> {
  const limit = input.limit ?? 10
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('werkstaetten')
    .select(SELECT_COLS)
    .eq('status', STATUS_AKTIV)

  if (error || !data) return []

  const rows = data as Array<Omit<WerkstattFinderRow, 'distanz_km'>>

  // Echter Geo-Origin vorhanden -> nach Distanz rangieren.
  if (input.lat !== undefined && input.lng !== undefined) {
    return rankWerkstaetten(rows, { lat: input.lat, lng: input.lng }).slice(0, limit)
  }

  // MVP-Fallback: nur PLZ bekannt -> ohne Distanz nach Name sortiert (distanz_km = Infinity).
  if (input.plz) {
    return rows
      .map((r) => ({ ...r, distanz_km: Infinity }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, limit)
  }

  // Kein Origin -> kein sinnvolles Ranking moeglich.
  return []
}
