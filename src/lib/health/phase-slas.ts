// Phase-SLAs und Terminal-Set fuer Funnel-Health-Checks.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task2
//
// Terminal-Set: abgeleitet aus FALL_STATUS_TRANSITIONS (state-machine.ts) —
// alle Phasen ohne erlaubte Folge-Uebergaenge (leeres Array).
// Muss zu FALL_STATUS_TRANSITIONS in state-machine.ts passen.
export const TERMINAL_PHASES = new Set(['abgeschlossen', 'storniert'])

// SLA in Tagen pro operative_status (Spec §4).
// Default 14 fuer nicht gelistete Phasen (slaTage-Fallback).
export const PHASE_SLA_TAGE: Record<string, number> = {
  ersterfassung: 7,
  'sv-zugewiesen': 5,
  'sv-termin': 10,
  besichtigung: 7,
  'begutachtung-laeuft': 7,
  'gutachten-eingegangen': 7,
  filmcheck: 5,
  'kanzlei-uebergeben': 21,
  anschlussschreiben: 30,
  regulierung: 30,
  'regulierung-laeuft': 30,
  // B4-slice-1b: gleiche 30 Tage wie 'regulierung' — eine VS-Antwortzeit von 20+ Tagen ist normal.
  // Ohne Eintrag greift der 14-Tage-Fallback und der Health-Check wirft dauerhaft WARN/CRIT auf
  // voellig normale Versicherungs-Verhandlungen.
  in_kommunikation_vs: 30,
  abgelehnt: 30,
  'zahlung-eingegangen': 14,
}

/** SLA in Tagen fuer eine Phase; 14 fuer nicht explizit konfigurierte. */
export const slaTage = (phase: string): number => PHASE_SLA_TAGE[phase] ?? 14
