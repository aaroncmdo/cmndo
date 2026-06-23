/**
 * DAT-Verzeichnis-Stub.
 *
 * Die echte DAT-API/Export-Anbindung ist GATED auf DAT-Zugang (Aaron).
 * Dedup-Key im RPC: `dat_id` (UNIQUE) — bei echter Anbindung wird `dat_id` pro
 * Kandidat gesetzt, damit onConflict(dat_id) greift und kein Duplikat entsteht.
 *
 * Bis zur Freischaltung liefert `fetchCandidates()` ein leeres Array —
 * der Bulk-CSV-Import (Task 4) uebernimmt die initiale Befullung.
 *
 * TODO: Wenn DAT-Zugang vorhanden → echtes fetch() hier eintragen:
 *   const rows = await fetchFromDatApi()
 *   return rows.map(r => ({ name: r.name, adresse: r.adresse, lat: r.lat, lng: r.lng, dat_id: r.id, ... }))
 */

import type { SvLeadSource } from './types'

export const datStubSource: SvLeadSource = {
  name: 'dat_sync',

  async fetchCandidates() {
    // Stub — DAT-API-Wiring noch nicht aktiv (kein DAT-Zugang).
    // Gibt [] zurueck damit syncSvLeadsFromSource korrekt importiert: 0 meldet.
    return []
  },
}
