// Finder-Sichtbarkeit — spiegelt die Eligibility-Gates des oeffentlichen Gutachter-
// Finders (die ladeAktiveSVs-Query in src/lib/actions/gutachter-finder-actions.ts).
// Damit Admins in /admin/sachverstaendige SEHEN, warum ein SV (nicht) im Finder
// auftaucht — ohne raten/nachfragen.
//
// Test-Accounts werden seit #3438 per kanonischem ist_testaccount-DB-Flag gefiltert
// (nicht mehr per firmenname-ILIKE-Heuristik) — dieser Badge spiegelt das Flag. Bei
// Aenderung der Finder-Gates (ladeAktiveSVs) HIER nachziehen.

export type FinderVisibilityReason =
  | 'kein-portal-zugang'
  | 'nicht-aktiv'
  | 'gesperrt'
  | 'geloescht'
  | 'keine-isochrone'
  | 'kein-standort'
  | 'test-account'

export type FinderVisibilityInput = {
  // ⚠ Diese vier sind PFLICHT, nicht optional — und das ist Absicht. Als optionale
  // Felder haette ein Aufrufer, der sie nicht durchreicht, ein stilles `undefined`
  // geliefert, und das Badge haette fuer JEDEN Gutachter "nicht freigeschaltet"
  // gemeldet, ohne dass der Compiler etwas sagt. Genau das waere beim Umbau am
  // 19.09. passiert: der einzige Aufrufer reichte drei davon nicht durch.
  ist_aktiv: boolean | null
  /** Anzahlung durch ODER vom Admin freigegeben — das eigentliche Eintrittsbillett. */
  portal_zugang_freigeschaltet: boolean | null
  /** Admin-Riegel; gesetzt = raus aus dem Finder. */
  gesperrt_seit: string | null
  geloescht_am: string | null
  /** Ob eine Isochrone berechnet ist (isochrone_polygon IS NOT NULL). */
  hatIsochrone?: boolean | null
  standort_lat?: number | null
  standort_lng?: number | null
  /** Kanonisches Test-/Demo-Account-Flag (ist_testaccount) — ersetzt die firmenname-Heuristik. */
  istTestaccount?: boolean | null
  /**
   * Wird seit dem 19.09. NICHT mehr geprueft (Aaron-Entscheidung, siehe unten). Bleibt im
   * Typ, weil die Aufrufer die Spalte ohnehin selektieren.
   */
  verifiziert?: boolean | null
}

/**
 * Ist der SV im oeffentlichen Finder sichtbar? Der erste fehlschlagende Gate liefert
 * den Grund. Reihenfolge/Regeln spiegeln ladeAktiveSVs bzw. die anon-Policy
 * `sachverstaendige__b1sel_an`:
 *   ist_aktiv & portal_zugang_freigeschaltet & !gesperrt & !geloescht
 *   & isochrone_polygon != null & standort != null & !ist_testaccount
 *
 * ⚠ ZWEI Aenderungen am 19.09.2026:
 *
 * 1. `verifiziert` faellt weg (Aaron: "Die Verifizierung ist ja keine notwendige Sache
 *    fuer den Finder"). Begruendung und Messung im Kopf von @/lib/sv/dispatch-gate.
 *
 * 2. `portal_zugang_freigeschaltet`, `gesperrt_seit` und `geloescht_am` kommen NEU dazu.
 *    Sie standen in der echten Finder-Query schon immer, fehlten hier aber — dieses
 *    Badge konnte also "sichtbar" melden, obwohl der Gutachter gesperrt war oder gar
 *    keinen Portal-Zugang hatte. Ein Spiegel, der etwas anderes zeigt als das Original,
 *    ist schlimmer als keiner: Er beantwortet genau die Frage falsch, fuer die es ihn gibt.
 */
export function deriveFinderVisibility(
  sv: FinderVisibilityInput,
): { visible: boolean; reason?: FinderVisibilityReason } {
  if (sv.ist_aktiv !== true) return { visible: false, reason: 'nicht-aktiv' }
  if (sv.portal_zugang_freigeschaltet !== true) {
    return { visible: false, reason: 'kein-portal-zugang' }
  }
  if (sv.gesperrt_seit != null) return { visible: false, reason: 'gesperrt' }
  if (sv.geloescht_am != null) return { visible: false, reason: 'geloescht' }
  if (sv.hatIsochrone !== true) return { visible: false, reason: 'keine-isochrone' }
  if (sv.standort_lat == null || sv.standort_lng == null) {
    return { visible: false, reason: 'kein-standort' }
  }
  if (sv.istTestaccount === true) return { visible: false, reason: 'test-account' }
  return { visible: true }
}
