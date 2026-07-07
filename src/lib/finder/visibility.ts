// Finder-Sichtbarkeit — spiegelt die Eligibility-Gates des oeffentlichen Gutachter-
// Finders (die ladeAktiveSVs-Query + der isTestAccount-Filter in
// src/lib/actions/gutachter-finder-actions.ts). Damit Admins in /admin/sachverstaendige
// SEHEN, warum ein SV (nicht) im Finder auftaucht — ohne raten/nachfragen.
//
// Bewusste kleine Duplikation der Test-Name-Heuristik: die zentrale liegt als
// lokale Funktion im 'use server'-Loader und laesst sich von dort nicht als reine
// Helferfunktion importieren, ohne sie zur Server-Action zu machen. Bei Aenderung
// der Finder-Gates (ladeAktiveSVs) HIER nachziehen.

export type FinderVisibilityReason =
  | 'nicht-verifiziert'
  | 'nicht-aktiv'
  | 'keine-isochrone'
  | 'kein-standort'
  | 'test-name'

export type FinderVisibilityInput = {
  verifiziert?: boolean | null
  ist_aktiv?: boolean | null
  /** Ob eine Isochrone berechnet ist (isochrone_polygon IS NOT NULL). */
  hatIsochrone?: boolean | null
  standort_lat?: number | null
  standort_lng?: number | null
  firmenname?: string | null
}

function istTestName(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

/**
 * Ist der SV im oeffentlichen Finder sichtbar? Der erste fehlschlagende Gate liefert
 * den Grund. Reihenfolge/Regeln spiegeln ladeAktiveSVs:
 *   verifiziert=true & ist_aktiv=true & isochrone_polygon!=null & standort!=null
 *   & Firmenname ohne \b(test|smoke|demo)\b.
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
  if (istTestName(sv.firmenname)) return { visible: false, reason: 'test-name' }
  return { visible: true }
}
