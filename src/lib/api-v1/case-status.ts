import type { ClaimMainPhase, ClaimSubPhase } from '@/lib/claims/lifecycle'
import { phaseForOperativeStatus } from '@/lib/claims/lifecycle'

// Grober, kunden-facing Fall-Status fuer die oeffentliche case-status-API (MCP/GPT-Action).
//
// PII-FREI by design: liefert NUR ein kunden-taugliches, GROBES Status-Label — NIE
// Name/Telefon/SV/Fall-Detail und NIE den rohen operative_status-Code (interne Taxonomie).
//
// Quelle = die KANONISCHE Lifecycle-Phase (phaseForOperativeStatus -> OPERATIVE_PHASE, dieselbe
// Map wie der Claim-Stepper / v_claim_phase). Wir gruppieren auf die 4 Hauptphasen (erfassung/
// begutachtung/regulierung/abschluss) + unterscheiden die Abschluss-Ausgaenge (sonst waere ein
// pauschales "abgeschlossen" fuer eine Ablehnung/Stornierung/Klage irrefuehrend). BEWUSST NICHT
// die internen SUBPHASE_LABEL ("Filmcheck"/"QC-Pruefung"/"SA-Unterschrift offen") — die sind
// Fachsprache, nicht kundentauglich. Unbekannter/fehlender/nicht-gemappter Status -> Fallback
// (z.B. Lead noch nicht in einen Claim konvertiert).
export const CASE_STATUS_FALLBACK = 'Ihre Anfrage ist eingegangen und wird bearbeitet.'

const KUNDE_STATUS_BY_MAIN: Record<ClaimMainPhase, string> = {
  erfassung: 'Ihre Anfrage ist eingegangen — wir organisieren gerade einen passenden Gutachter.',
  begutachtung: 'Ein Gutachter ist beauftragt — die Begutachtung Ihres Schadens läuft.',
  regulierung: 'Wir regulieren Ihren Schaden mit der gegnerischen Versicherung.',
  abschluss: 'Ihr Fall ist abgeschlossen.',
}

// Feinere kunde-Labels fuer die Abschluss-Ausgaenge: ein pauschales "abgeschlossen" waere fuer
// eine Ablehnung/Stornierung/Klage irrefuehrend. Nur diese Sub-Phasen ueberschreiben das
// Haupt-Label; alle anderen Sub-Phasen nutzen KUNDE_STATUS_BY_MAIN.
const KUNDE_STATUS_BY_SUB: Partial<Record<ClaimSubPhase, string>> = {
  erfolgreich_reguliert: 'Ihr Fall ist erfolgreich abgeschlossen und reguliert.',
  termin_durchgefuehrt: 'Der Gutachter-Termin ist erfolgt — Ihr Fall ist abgeschlossen.',
  storniert: 'Ihr Fall wurde gestoppt.',
  abgelehnt_final: 'Die gegnerische Versicherung hat den Anspruch abgelehnt.',
  klage_rechtsstreit: 'Ihr Fall wird gerichtlich geklärt (Rechtsstreit).',
  an_externe_kanzlei: 'Ihr Fall wurde an eine Rechtsanwaltskanzlei übergeben.',
}

export function coarseKundeStatus(operativeStatus: string | null | undefined): string {
  const phase = phaseForOperativeStatus(operativeStatus)
  if (!phase) return CASE_STATUS_FALLBACK
  return KUNDE_STATUS_BY_SUB[phase.sub] ?? KUNDE_STATUS_BY_MAIN[phase.main]
}
