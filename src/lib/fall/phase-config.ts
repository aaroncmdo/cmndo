// AAR-161 / W1: Fallakte Phase-Config — Status → sichtbare Stammdaten-Sektionen.
//
// Wird von FallContext (W2) konsumiert um Tab-Inhalte und Sidebar-Sektionen
// phasenabhängig ein-/auszublenden. Die Sektions-Namen sind technisch — die
// Stammdaten-Komponenten (KundendatenSection, FahrzeugdatenSection etc.)
// mappen 1:1 darauf.
//
// Quelle: Notion-Spec 3431da4c9124814db2ecf2d7e613de03 + Subphasen-Matrix
// 3431da4c91248176ae66e2a981993f60. Die Status-Codes folgen der neuen
// Subphasen-Matrix — legacy-Codes aus statusLabels.ts sind auf semantisch
// gleichwertige Neucodes gemappt (z. B. `sv-termin` → `termin-reserviert`).

export const STAMMDATEN_SECTIONS = [
  'kunde',
  'fahrzeug',
  'unfall',
  'gegner',
  'vorschaeden',
  'versicherung',
  'besichtigung',
  'kernwerte',
  'as-status',
  'kuerzung',
  'ruege',
  'stellungnahme',
  'nachbesichtigung',
  'regulierung',
  'klage',
  'auszahlung',
] as const

export type StammdatenSection = (typeof STAMMDATEN_SECTIONS)[number]

/**
 * Basis-Sektionen die ab Fall-Erstellung immer sichtbar sind.
 * Entspricht der Notion-Spec Phase `ersterfassung` / `erstgespraech`.
 */
const BASIS: StammdatenSection[] = [
  'kunde',
  'fahrzeug',
  'unfall',
  'gegner',
  'vorschaeden',
  'versicherung',
]

/**
 * Mapping Fall-Status → sichtbare Stammdaten-Sektionen.
 *
 * Status-Quelle: Notion-Spec (Subphasen-Matrix). Für jeden bestehenden
 * Legacy-Status aus statusLabels.ts (FALL_STATUS_LABELS) ist zusätzlich ein
 * Alias aufgenommen damit Alt-Daten konsistent rendern.
 */
export const PHASE_VISIBLE_SECTIONS: Record<string, StammdatenSection[]> = {
  // ── Phase 1/2: Ersterfassung + Vorbereitung ──────────────────────────
  ersterfassung: BASIS,
  erstgespraech: BASIS,
  'flow-gesendet': BASIS,
  onboarding: BASIS,

  // ── Phase 2→3: SV gesucht / Termin reserviert ────────────────────────
  'sv-gesucht': [...BASIS, 'besichtigung'],
  'termin-reserviert': [...BASIS, 'besichtigung'],
  'sv-zugewiesen': [...BASIS, 'besichtigung'], // Legacy-Alias
  'sv-termin': [...BASIS, 'besichtigung'], // Legacy-Alias

  // ── Phase 3: Besichtigung läuft / Gutachten in Bearbeitung ───────────
  'besichtigung-laeuft': [...BASIS, 'besichtigung'],
  'gutachten-bearbeitung': [...BASIS, 'besichtigung'],
  besichtigung: [...BASIS, 'besichtigung'], // Legacy-Alias
  'begutachtung-laeuft': [...BASIS, 'besichtigung'], // Legacy-Alias

  // ── Phase 4: Gutachten erstellt / Akte übergeben ─────────────────────
  'gutachten-erstellt': [...BASIS, 'besichtigung', 'kernwerte'],
  'akte-uebergeben': [...BASIS, 'besichtigung', 'kernwerte'],
  'gutachten-eingegangen': [...BASIS, 'besichtigung', 'kernwerte'], // Legacy
  filmcheck: [...BASIS, 'besichtigung', 'kernwerte'], // Legacy
  'qc-pruefung': [...BASIS, 'besichtigung', 'kernwerte'], // Legacy
  'kanzlei-uebergeben': [...BASIS, 'besichtigung', 'kernwerte'], // Legacy

  // ── Phase 5: AS-Vorbereitung / AS versendet / Warten auf VS ──────────
  'as-vorbereitung': [...BASIS, 'besichtigung', 'kernwerte', 'as-status'],
  'as-versendet': [...BASIS, 'besichtigung', 'kernwerte', 'as-status'],
  'warten-auf-vs': [...BASIS, 'besichtigung', 'kernwerte', 'as-status'],
  anschlussschreiben: [...BASIS, 'besichtigung', 'kernwerte', 'as-status'], // Legacy
  'as-gesendet': [...BASIS, 'besichtigung', 'kernwerte', 'as-status'], // Legacy

  // ── Phase 6: VS-Kürzung + Rüge-Prozess ───────────────────────────────
  'vs-kuerzt': [
    ...BASIS,
    'besichtigung',
    'kernwerte',
    'as-status',
    'kuerzung',
    'ruege',
    'stellungnahme',
  ],

  // ── Phase 7: Nachbesichtigung läuft ──────────────────────────────────
  'nachbesichtigung-laeuft': [
    ...BASIS,
    'besichtigung',
    'kernwerte',
    'as-status',
    'nachbesichtigung',
  ],

  // ── Phase 6a/8: VS reguliert / Regulierung läuft ─────────────────────
  'vs-reguliert': [...BASIS, 'besichtigung', 'kernwerte', 'as-status', 'regulierung'],
  'regulierung-laeuft': [...BASIS, 'besichtigung', 'kernwerte', 'as-status', 'regulierung'],
  regulierung: [...BASIS, 'besichtigung', 'kernwerte', 'as-status', 'regulierung'], // Legacy
  'vs-regulierung': [...BASIS, 'besichtigung', 'kernwerte', 'as-status', 'regulierung'], // Legacy

  // ── Phase 6c: VS lehnt ab ────────────────────────────────────────────
  'vs-abgelehnt': [...BASIS, 'besichtigung', 'kernwerte', 'as-status', 'kuerzung'],

  // ── Phase 8: Zahlung eingegangen / Auszahlung ────────────────────────
  'zahlung-eingegangen': [
    ...BASIS,
    'besichtigung',
    'kernwerte',
    'as-status',
    'regulierung',
    'auszahlung',
  ],

  // ── Phase 7.6: Klage ─────────────────────────────────────────────────
  klage: [
    ...BASIS,
    'besichtigung',
    'kernwerte',
    'as-status',
    'kuerzung',
    'ruege',
    'stellungnahme',
    'klage',
  ],

  // ── Phase 9: Abschluss — ALLE sichtbar, read-only (siehe field-permissions) ──
  abgeschlossen: STAMMDATEN_SECTIONS as unknown as StammdatenSection[],
  storniert: STAMMDATEN_SECTIONS as unknown as StammdatenSection[],
}

/**
 * Helper: liefert die sichtbaren Sektionen für einen Status.
 * Unbekannte Status fallen auf BASIS zurück (defensive default).
 */
export function getVisibleSections(status: string | null | undefined): StammdatenSection[] {
  if (!status) return BASIS
  return PHASE_VISIBLE_SECTIONS[status] ?? BASIS
}
