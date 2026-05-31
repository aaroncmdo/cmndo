// T1.2-b (CMM-49 §D3): faelle-Status (19-Enum) -> claims.status (Lifecycle/Terminal).
//
// Reine Mapping-Schicht fuer den state-machine.ts-Umbau. Die Spalten-Side-Effects
// (kanzlei_faelle / auftraege / gutachten / claim_payments — vs_reaktion_typ,
// anschlussschreiben_am, zahlung etc.) verdrahten die Peel-Helper + die status-
// spezifischen Bloecke der Engine BEREITS. Diese Map liefert nur den claims.status-
// Wert — bzw. das Signal "claims.status NICHT anfassen" (null), wenn die Phase
// rein aus den Sub-Entities via v_claim_phase abgeleitet wird.
//
// Logik der Regulierungs-Achse — NUR Werte setzen, die v_claim_phase auch ableitet:
//   regulierung[-laeuft]  -> in_kommunikation_vs   (VS-Verhandlung; main=regulierung)
//   zahlung-eingegangen   -> null                  (Geld da -> claim_payments.status='erhalten';
//                                                    claims.status bleibt in_kommunikation_vs)
//   abgeschlossen         -> reguliert_vollstaendig (alles fertig; main=abschluss)
//
// WICHTIG (c-Konsistenz): jeder gesetzte claims.status MUSS von v_claim_phase erkannt
// werden, sonst leitet die View eine falsche Phase ab. v_claim_phase kennt status-seitig
// nur die 7 Terminals + in_kommunikation_vs + abgelehnt. 'reguliert' waere ein Orphan ->
// daher zahlung-eingegangen NICHT auf 'reguliert' (Bug aus dem b'-Vorbau, hier korrigiert).
//
// In transitionFallStatus verdrahtet (T1.2-b', #2151) — Dual-Write: faelle.status bleibt,
// claims.status additiv. faelle.status-Write-Stopp = b'' (nach Reader-Repoint d).

/**
 * claims.status-Terminals (main_phase='abschluss'-Menge, A7 §1). `abgeschlossen`
 * (faelle) darf einen bereits gesetzten, spezifischeren Terminal NICHT
 * ueberschreiben (z.B. klage_rechtsstreit beim Pfad klage -> abgeschlossen).
 */
export const CLAIMS_TERMINAL_STATES: ReadonlySet<string> = new Set([
  'reguliert_vollstaendig',
  'storniert',
  'klage_rechtsstreit',
  'verjaehrt',
  'abgelehnt_final',
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
])

/**
 * Direkte faelle-Status -> claims.status. `null` = claims.status NICHT setzen
 * (aktive Phasen + Sub-Entity-getragene Zustaende; Phase kommt aus v_claim_phase).
 * `abgeschlossen` ist bewusst NICHT hier — es laeuft ueber den Guard in
 * mapFallStatusToClaimStatus (darf bestehenden Terminal nicht clobbern).
 */
const FALL_STATUS_TO_CLAIM_STATUS: Readonly<Record<string, string | null>> = {
  // Aktive Phasen — via v_claim_phase aus gutachter_termine/auftraege abgeleitet
  ersterfassung: null,
  onboarding: null,
  'sv-gesucht': null,
  'sv-zugewiesen': null,
  'sv-termin': null,
  besichtigung: null,
  'begutachtung-laeuft': null,
  'gutachten-eingegangen': null,
  // QC-Gate — gutachten.status / auftraege.status tragen die Granularitaet
  filmcheck: null,
  'qc-pruefung': null,
  // Kanzlei-/VS-Sub-Zustaende — kanzlei_faelle traegt die Granularitaet
  'kanzlei-uebergeben': null,
  anschlussschreiben: null,
  'vs-kuerzt': null,
  'nachbesichtigung-laeuft': null,
  // VS-Kommunikations-/Regulierungs-Achse — NUR v_claim_phase-erkannte Werte:
  regulierung: 'in_kommunikation_vs',
  'regulierung-laeuft': 'in_kommunikation_vs',
  // zahlung-eingegangen: KEIN claims.status-Write. claim_payments.status='erhalten' traegt
  // den Geldeingang; claims.status bleibt in_kommunikation_vs bis abgeschlossen. ('reguliert'
  // ist kein v_claim_phase-CASE-Zweig -> wuerde falsche Phase ableiten.)
  'zahlung-eingegangen': null,
  // Terminals / Quasi-Terminals
  'vs-abgelehnt': 'abgelehnt', // NICHT abgelehnt_final — kann noch -> klage eskalieren
  klage: 'klage_rechtsstreit',
  storniert: 'storniert',
}

export interface ClaimStatusMapping {
  /** true = claims.status auf `value` setzen; false = claims.status unveraendert lassen */
  setClaimStatus: boolean
  value: string | null
}

const NO_WRITE: ClaimStatusMapping = { setClaimStatus: false, value: null }

/**
 * Bildet einen faelle-Status-Uebergang auf den zu schreibenden claims.status ab.
 *
 * @param newFallStatus  Ziel-faelle-Status (das, was Caller heute an
 *                       transitionFallStatus uebergeben).
 * @param currentClaimStatus  aktueller claims.status (fuer den abgeschlossen-Guard).
 */
export function mapFallStatusToClaimStatus(
  newFallStatus: string,
  currentClaimStatus: string | null,
): ClaimStatusMapping {
  // abgeschlossen = Happy-Path-Terminal, aber bestehenden spezifischeren Terminal
  // (klage_rechtsstreit / abgelehnt_final / storniert / ...) NICHT ueberschreiben.
  if (newFallStatus === 'abgeschlossen') {
    if (currentClaimStatus !== null && CLAIMS_TERMINAL_STATES.has(currentClaimStatus)) {
      return NO_WRITE
    }
    return { setClaimStatus: true, value: 'reguliert_vollstaendig' }
  }

  if (!(newFallStatus in FALL_STATUS_TO_CLAIM_STATUS)) {
    // Unbekannter Status -> claims.status nicht anfassen (defensiv).
    return NO_WRITE
  }

  const mapped = FALL_STATUS_TO_CLAIM_STATUS[newFallStatus]
  return mapped === null ? NO_WRITE : { setClaimStatus: true, value: mapped }
}
