// Operative-Status Auto-Advance — reine Entscheidungs-Logik (server-import-frei → unit-testbar).
//
// Kanzlei-Strecke-Investigation 28.06.: checkFallAutoPhase (autoPhase.ts) las seine Signale
// aus v_faelle_mit_aktuellem_termin — die nach CMM-49 alle NULL liefert (Spalten in
// Sub-Entities verschoben). Folge: die operative Auto-Advance-Engine war fuer ALLE Claims
// tot (74/89 auf sv-termin eingefroren), maskiert durch den milestone-basierten v_claim_phase-
// Stepper. Zusaetzlich war der filmcheck-Schritt zirkulaer (gutachten-eingegangen + filmcheck_ok
// -> filmcheck, aber filmcheck_ok setzt erst saveFilmcheck, das schon nach kanzlei-uebergeben
// springt) -> kein Claim erreichte je filmcheck.
//
// Diese Funktion ist die kanonische Phasen-Entscheidung. autoPhase.ts laedt die Signale
// LIVE (claims + gutachten + gutachter_termine + auftraege + kanzlei_faelle + claim_payments)
// und ruft sie. Halb-automatik (Aaron 28.06.): auto bis 'filmcheck'; den Kanzlei-Handoff
// (filmcheck -> kanzlei-uebergeben + Kanzlei-Mails + Anschlussschreiben-Task) macht KB
// bewusst manuell via saveFilmcheck (QC-Gate) — hier KEIN Auto-Sprung.

export type OperativeSignals = {
  /** claims.sv_id gesetzt (SV zugewiesen) */
  hasSvId: boolean
  /** aktiver gutachter_termine-Eintrag vorhanden */
  hasTermin: boolean
  /** gutachten.fertiggestellt_am gesetzt */
  gutachtenFertig: boolean
  /** claims.service_typ === 'komplett' (nur dann Kanzlei-Strecke) */
  istKomplett: boolean
  /** kanzlei_faelle.anschlussschreiben_am gesetzt */
  anschlussschreibenVorhanden: boolean
  /** claim_payments.zahlungseingang_am gesetzt (Zahlung eingegangen) */
  zahlungEingegangen: boolean
}

/**
 * Naechster operativer Status fuer den gegebenen aktuellen Status + Signale.
 * Gibt genau EINEN Schritt zurueck (oder null = kein Auto-Advance moeglich).
 * Reihenfolge spiegelt FALL_STATUS_TRANSITIONS (state-machine.ts).
 */
export function computeNextOperativePhase(status: string, s: OperativeSignals): string | null {
  switch (status) {
    case 'ersterfassung':
      return s.hasSvId ? 'sv-zugewiesen' : null
    case 'sv-zugewiesen':
      return s.hasTermin ? 'sv-termin' : null
    case 'sv-termin':
    case 'besichtigung':
      return s.gutachtenFertig ? 'gutachten-eingegangen' : null
    case 'gutachten-eingegangen':
      // KERN-FIX: komplett-gated (nicht zirkulaer ueber filmcheck_ok). nur_gutachter bleibt
      // hier stehen (keine Kanzlei-Strecke). Mandat ist fuer komplett per SA-Signing gegeben;
      // das LexDrive-mandatsnummer-Ack wird nicht als Gate verlangt (sonst Timing-Loch).
      return s.istKomplett ? 'filmcheck' : null
    case 'filmcheck':
      // HALB-AUTOMATIK-GRENZE: KB macht den Handoff via saveFilmcheck. Kein Auto-Sprung.
      return null
    case 'kanzlei-uebergeben':
      return s.anschlussschreibenVorhanden ? 'anschlussschreiben' : null
    case 'anschlussschreiben':
    case 'regulierung':
      return s.zahlungEingegangen ? 'abgeschlossen' : null
    default:
      return null
  }
}
