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
  faehigkeiten: string[] | null
  distanz_km: number
  passt: boolean
}

/** Status-Wert, der eine aktive (matchbare) Werkstatt markiert. */
const STATUS_AKTIV = 'aktiv'

/**
 * Deckt die Werkstatt die Schadenskategorie ab? Leer/kein-Filter = ja.
 * Vokabular: karosserie | lackierung | mechanik | glas | smart_repair (+ unbekannt = kein Filter).
 */
export function computePasst(faehigkeiten: string[] | null | undefined, kategorie?: string | null): boolean {
  if (kategorie == null || kategorie === 'unbekannt') return true
  if (!faehigkeiten || faehigkeiten.length === 0) return true
  return faehigkeiten.includes(kategorie)
}

/**
 * Pure: filtert auf aktive Werkstaetten, berechnet die Luftlinie zum Origin,
 * annotiert passt-Flag (Kategorie-Matching) und sortiert:
 *   1. passende vor nicht-passenden
 *   2. innerhalb einer Gruppe aufsteigend nach Distanz
 *
 * Entscheidung no-lat/lng: Werkstaetten ohne Koordinaten werden NICHT
 * herausgefiltert, sondern mit distanz_km = Infinity ans Listenende geschoben.
 * So bleibt eine aktive Partner-Werkstatt mit fehlendem Geo (Stammdaten-Luecke)
 * fuer den Dispatcher sichtbar, statt stillschweigend zu verschwinden.
 */
export function rankWerkstaetten(
  rows: Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'>>,
  origin: { lat: number; lng: number },
  kategorie?: string | null,
): WerkstattFinderRow[] {
  return rows
    .filter((r) => r.status === STATUS_AKTIV)
    .map((r) => ({
      ...r,
      distanz_km:
        r.lat !== null && r.lng !== null
          ? haversineKm(origin.lat, origin.lng, r.lat, r.lng)
          : Infinity,
      passt: computePasst(r.faehigkeiten, kategorie),
    }))
    .sort((a, b) => (a.passt === b.passt ? a.distanz_km - b.distanz_km : a.passt ? -1 : 1))
}

const SELECT_COLS = 'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten'

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
  kategorie?: string | null
}): Promise<WerkstattFinderRow[]> {
  const limit = input.limit ?? 10
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('werkstaetten')
    .select(SELECT_COLS)
    .eq('status', STATUS_AKTIV)

  if (error || !data) return []

  const rows = data as Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'>>

  // Echter Geo-Origin vorhanden -> nach Distanz + Kategorie-Passung rangieren.
  if (input.lat !== undefined && input.lng !== undefined) {
    return rankWerkstaetten(rows, { lat: input.lat, lng: input.lng }, input.kategorie).slice(0, limit)
  }

  // MVP-Fallback: nur PLZ bekannt -> ohne Distanz nach Name sortiert (distanz_km = Infinity).
  if (input.plz) {
    return rows
      .map((r) => ({ ...r, distanz_km: Infinity, passt: computePasst(r.faehigkeiten, input.kategorie) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, limit)
  }

  // Kein Origin -> kein sinnvolles Ranking moeglich.
  return []
}
