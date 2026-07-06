// AAR-664: Konstanten getrennt von der `'use server'`-Action.
//
// Hintergrund: Next.js 15 exportiert aus einer Datei mit `'use server'`
// nur Server-Action-Stubs. Non-function Exports (z. B. das Array
// ALLOWED_STATUS_VALUES) sind im Client-Bundle nicht das Original — der
// Import liefert undefined / Action-Proxy. Folge: `.map(...)` im
// ManualStatusOverrideModal wirft `an.map is not a function` und reißt
// die komplette Fallakte runter (FallActionBar mountet den Modal immer,
// auch closed → Component-Body wird beim Render ausgewertet).
//
// Diese Datei darf KEIN `'use server'` haben — sie wird sowohl vom
// Client-Modal als auch von der Server-Action importiert.

export const ALLOWED_STATUS_VALUES = [
  // NUR fall_status-Enum-gueltige Werte: der Override schreibt claims.operative_status, und
  // v_claim_base castet ::fall_status -> ein enum-fremder Wert wirft bei JEDEM Read
  // 'invalid input value for enum fall_status' und reisst die ganze Akte + alle Portale runter.
  // Die frueheren claims.status-Namen (in_bearbeitung/vs_kontakt/reguliert/abgelehnt/kanzlei) sind
  // KEINE fall_status-Enum-Werte -> entfernt. Terminale claims.status-Aenderungen laufen ueber die
  // Endzustand-Actions (markClaimAsReguliert etc.), nicht ueber den operative_status-Override.
  'onboarding',
  'storniert',
  // Welle-6 Werte (Backward-Compat für ältere Fälle)
  'ersterfassung',
  'sv-gesucht',
  'sv-zugewiesen',
  'sv-termin',
  'besichtigung',
  'begutachtung-laeuft',
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'zahlung-eingegangen',
  'abgeschlossen',
] as const

export type FallStatusValue = (typeof ALLOWED_STATUS_VALUES)[number]
