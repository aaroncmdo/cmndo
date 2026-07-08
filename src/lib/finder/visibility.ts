// Finder-Sichtbarkeit — spiegelt die Eligibility-Gates des oeffentlichen Gutachter-
// Finders (die ladeAktiveSVs-Query in src/lib/actions/gutachter-finder-actions.ts).
// Damit Admins in /admin/sachverstaendige SEHEN, warum ein SV (nicht) im Finder
// auftaucht — ohne raten/nachfragen.
//
// Test-Accounts werden seit #3438 per kanonischem ist_testaccount-DB-Flag gefiltert
// (nicht mehr per firmenname-ILIKE-Heuristik) — dieser Badge spiegelt das Flag. Bei
// Aenderung der Finder-Gates (ladeAktiveSVs) HIER nachziehen.

export type FinderVisibilityReason =
  | 'nicht-verifiziert'
  | 'nicht-aktiv'
  | 'keine-isochrone'
  | 'kein-standort'
  | 'test-account'

export type FinderVisibilityInput = {
  verifiziert?: boolean | null
  ist_aktiv?: boolean | null
  /** Ob eine Isochrone berechnet ist (isochrone_polygon IS NOT NULL). */
  hatIsochrone?: boolean | null
  standort_lat?: number | null
  standort_lng?: number | null
  /** Kanonisches Test-/Demo-Account-Flag (ist_testaccount) — ersetzt die firmenname-Heuristik. */
  istTestaccount?: boolean | null
}

/**
 * Ist der SV im oeffentlichen Finder sichtbar? Der erste fehlschlagende Gate liefert
 * den Grund. Reihenfolge/Regeln spiegeln ladeAktiveSVs:
 *   verifiziert=true & ist_aktiv=true & isochrone_polygon!=null & standort!=null
 *   & ist_testaccount=false.
 */
export function deriveFinderVisibility(
  sv: FinderVisibilityInput,
): { visible: boolean; reason?: FinderVisibilityReason } {
  if (sv.verifiziert !== true) return { visible: false, reason: 'nicht-verifiziert' }
  if (sv.ist_aktiv !== true) return { visible: false, reason: 'nicht-aktiv' }
  if (sv.hatIsochrone !== true) return { visible: false, reason: 'keine-isochrone' }
  if (sv.standort_lat == null || sv.standort_lng == null) {
    return { visible: false, reason: 'kein-standort' }
  }
  if (sv.istTestaccount === true) return { visible: false, reason: 'test-account' }
  return { visible: true }
}
