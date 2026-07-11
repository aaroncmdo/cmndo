// src/lib/ops/claim-workflow-meta.ts
// Aktions-Layer: pro Claim-Sub-Phase die naechste-beste-Aktion, der Owner, worauf gewartet
// wird, und die CTA-Copy. Farbe/Label kommen NICHT hierher (die liefert die fall-phase-
// Registry-Domain + SUBPHASE_LABEL) -- hier nur die Handlung.
import type { ClaimSubPhase } from '@/lib/claims/lifecycle'
import type { ClaimNextActionCode, OwnerRole, WaitingOn } from './claim-workstate.types'

export interface ClaimWorkflowMetaEntry {
  nextActionCode: ClaimNextActionCode
  ownerRole: OwnerRole
  waitingOn: WaitingOn
  ctaLabel: string // UI-sichtbar -> Umlaute
}

export const CLAIM_WORKFLOW_META: Record<ClaimSubPhase, ClaimWorkflowMetaEntry> = {
  sa_offen:                  { nextActionCode: 'sa_anfordern',         ownerRole: 'kb',       waitingOn: 'kunde',   ctaLabel: 'Schadenanzeige anfordern' },
  vollmacht_offen:           { nextActionCode: 'vollmacht_anfordern',  ownerRole: 'kb',       waitingOn: 'kunde',   ctaLabel: 'Vollmacht anfordern' },
  onboarding_offen:          { nextActionCode: 'onboarding_treiben',   ownerRole: 'kb',       waitingOn: 'kunde',   ctaLabel: 'Onboarding abschließen' },
  termin:                    { nextActionCode: 'sv_termin_setzen',     ownerRole: 'dispatch', waitingOn: 'sv',      ctaLabel: 'SV-Termin setzen' },
  besichtigung:              { nextActionCode: 'besichtigung_laeuft',  ownerRole: 'sv',       waitingOn: 'sv',      ctaLabel: 'Besichtigung läuft' },
  gutachten:                 { nextActionCode: 'gutachten_ausstehend', ownerRole: 'sv',       waitingOn: 'sv',      ctaLabel: 'Gutachten anfordern' },
  filmcheck:                 { nextActionCode: 'filmcheck',            ownerRole: 'intern',   waitingOn: 'intern',  ctaLabel: 'Filmcheck prüfen' },
  'qc-pruefung':             { nextActionCode: 'qc_pruefung',          ownerRole: 'intern',   waitingOn: 'intern',  ctaLabel: 'QC prüfen' },
  kanzlei_uebergabe:         { nextActionCode: 'kanzlei_uebergeben',   ownerRole: 'kb',       waitingOn: 'kanzlei', ctaLabel: 'An Kanzlei übergeben' },
  anschlussschreiben:        { nextActionCode: 'anschlussschreiben',   ownerRole: 'kb',       waitingOn: 'vs',      ctaLabel: 'Anschlussschreiben senden' },
  versicherungskontakt:      { nextActionCode: 'vs_nachfassen',        ownerRole: 'kb',       waitingOn: 'vs',      ctaLabel: 'Bei Versicherer nachfassen' },
  'vs-kuerzt':               { nextActionCode: 'kuerzung_pruefen',     ownerRole: 'kb',       waitingOn: 'intern',  ctaLabel: 'Kürzung prüfen' },
  'nachbesichtigung-laeuft': { nextActionCode: 'nachbesichtigung',     ownerRole: 'sv',       waitingOn: 'sv',      ctaLabel: 'Nachbesichtigung läuft' },
  nachforderung:             { nextActionCode: 'nachforderung_treiben',ownerRole: 'kb',       waitingOn: 'vs',      ctaLabel: 'Nachforderung treiben' },
  auszahlung:                { nextActionCode: 'auszahlung_pruefen',   ownerRole: 'kb',       waitingOn: 'none',    ctaLabel: 'Auszahlung prüfen' },
  // Terminals -> abgeschlossen (kein Handlungsbedarf)
  erfolgreich_reguliert:     { nextActionCode: 'abgeschlossen', ownerRole: 'none',    waitingOn: 'none',    ctaLabel: 'Abgeschlossen' },
  storniert:                 { nextActionCode: 'abgeschlossen', ownerRole: 'none',    waitingOn: 'none',    ctaLabel: 'Storniert' },
  klage_rechtsstreit:        { nextActionCode: 'abgeschlossen', ownerRole: 'kanzlei', waitingOn: 'kanzlei', ctaLabel: 'Klage/Rechtsstreit' },
  verjaehrt:                 { nextActionCode: 'abgeschlossen', ownerRole: 'none',    waitingOn: 'none',    ctaLabel: 'Verjährt' },
  abgelehnt_final:           { nextActionCode: 'abgeschlossen', ownerRole: 'none',    waitingOn: 'none',    ctaLabel: 'Abgelehnt' },
  an_externe_kanzlei:        { nextActionCode: 'abgeschlossen', ownerRole: 'kanzlei', waitingOn: 'kanzlei', ctaLabel: 'Externe Kanzlei' },
  termin_durchgefuehrt:      { nextActionCode: 'abgeschlossen', ownerRole: 'none',    waitingOn: 'none',    ctaLabel: 'Termin durchgeführt' },
  // WS6 Slice 2a: Reparatur-Lane (Selbstzahler/Kasko)
  reparatur_werkstattwahl:   { nextActionCode: 'werkstatt_waehlen',    ownerRole: 'none', waitingOn: 'kunde',  ctaLabel: 'Werkstatt wählen' },
  reparatur_terminfindung:   { nextActionCode: 'reparatur_terminieren', ownerRole: 'none', waitingOn: 'none',   ctaLabel: 'Reparaturtermin vereinbaren' },
  reparatur_laeuft:          { nextActionCode: 'reparatur_laeuft',      ownerRole: 'none', waitingOn: 'none',   ctaLabel: 'Reparatur läuft' },
  reparatur_fertig:          { nextActionCode: 'reparatur_abschliessen', ownerRole: 'intern', waitingOn: 'intern', ctaLabel: 'Reparatur abschließen' },
}

/** Default-SLA je Sub-Phase (Tage bis "ueberfaellig"). Kalibrierbar (Spec §13). */
export const CLAIM_SLA_DAYS: Partial<Record<ClaimSubPhase, number>> = {
  sa_offen: 3, vollmacht_offen: 3, onboarding_offen: 5,
  termin: 4, besichtigung: 3, gutachten: 7, filmcheck: 2, 'qc-pruefung': 2, kanzlei_uebergabe: 3,
  anschlussschreiben: 5, versicherungskontakt: 7, 'vs-kuerzt': 5, 'nachbesichtigung-laeuft': 7,
  nachforderung: 7, auszahlung: 5,
}
