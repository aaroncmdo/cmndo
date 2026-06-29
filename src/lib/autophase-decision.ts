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
  // --- Kanzlei-Fakten (KB-gepflegt; ab kanzlei-uebergeben) ---
  /** kanzlei_faelle.vs_reaktion_typ — Reaktion der gegnerischen Versicherung */
  vsReaktionTyp: 'voll' | 'gekuerzt' | 'abgelehnt' | null
  /** kanzlei_faelle.regulierung_am gesetzt */
  regulierungVorhanden: boolean
  /** kanzlei_faelle.klage_uebergeben_am gesetzt */
  klageVorhanden: boolean
  /** claims.abgeschlossen_am gesetzt (KB markiert Abschluss explizit) */
  abgeschlossenVorhanden: boolean
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
      // sv-termin -> gutachten-eingegangen ist KEIN gueltiger Direkt-Uebergang
      // (FALL_STATUS_TRANSITIONS erlaubt von sv-termin nur besichtigung/begutachtung-laeuft).
      // Wenn das Gutachten da ist, der Status aber auf sv-termin haengt (SV hat kein
      // "losgefahren"/begutachtung getriggert), ueber begutachtung-laeuft aufholen —
      // checkFallAutoPhase cascadet im Loop weiter bis gutachten-eingegangen -> filmcheck.
      return s.gutachtenFertig ? 'begutachtung-laeuft' : null
    case 'besichtigung':
    case 'begutachtung-laeuft':
      return s.gutachtenFertig ? 'gutachten-eingegangen' : null
    case 'gutachten-eingegangen':
      // KERN-FIX: komplett-gated (nicht zirkulaer ueber filmcheck_ok). nur_gutachter bleibt
      // hier stehen (keine Kanzlei-Strecke). Mandat ist fuer komplett per SA-Signing gegeben;
      // das LexDrive-mandatsnummer-Ack wird nicht als Gate verlangt (sonst Timing-Loch).
      return s.istKomplett ? 'filmcheck' : null
    case 'filmcheck':
      // HALB-AUTOMATIK-GRENZE: KB macht den Handoff via saveFilmcheck. Kein Auto-Sprung.
      return null
    // --- Kanzlei-Strecke (KB-Fakt-getrieben, ab kanzlei-uebergeben) ---
    case 'kanzlei-uebergeben':
      return s.anschlussschreibenVorhanden ? 'anschlussschreiben' : null
    case 'anschlussschreiben':
      // VS-Reaktion verzweigt. Klage hat Vorrang (furthest). Alle Ziele sind gueltige
      // FALL_STATUS_TRANSITIONS-Uebergaenge von anschlussschreiben.
      if (s.klageVorhanden) return 'klage'
      if (s.vsReaktionTyp === 'abgelehnt') return 'vs-abgelehnt'
      if (s.vsReaktionTyp === 'gekuerzt') return 'vs-kuerzt'
      if (s.regulierungVorhanden || s.vsReaktionTyp === 'voll') return 'regulierung-laeuft'
      return null
    case 'regulierung-laeuft':
      if (s.klageVorhanden) return 'klage'
      if (s.zahlungEingegangen) return 'zahlung-eingegangen'
      return null
    case 'regulierung':
      // Legacy/dispatch-gesetzt: FALL erlaubt von 'regulierung' KEINE direkte klage.
      if (s.zahlungEingegangen) return 'zahlung-eingegangen'
      if (s.abgeschlossenVorhanden) return 'abgeschlossen'
      return null
    case 'vs-kuerzt':
      if (s.klageVorhanden) return 'klage'
      if (s.regulierungVorhanden) return 'regulierung-laeuft'
      return null
    case 'vs-abgelehnt':
      return s.klageVorhanden ? 'klage' : null
    case 'klage':
      return s.abgeschlossenVorhanden ? 'abgeschlossen' : null
    case 'zahlung-eingegangen':
      // KB schliesst explizit ab (abgeschlossen_am) — kein Auto-Close auf Zahlung.
      return s.abgeschlossenVorhanden ? 'abgeschlossen' : null
    default:
      return null
  }
}
