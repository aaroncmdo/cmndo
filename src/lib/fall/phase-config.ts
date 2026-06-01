// AAR-161 / W1: Fallakte Phase-Config — abgeleitete Phase → sichtbare Stammdaten-Sektionen.
//
// Wird von FallContext (W2) konsumiert um Tab-Inhalte und Sidebar-Sektionen
// phasenabhängig ein-/auszublenden. Die Sektions-Namen sind technisch — die
// Stammdaten-Komponenten (KundendatenSection, FahrzeugdatenSection etc.)
// mappen 1:1 darauf.
//
// CMM-49 T1.2 (CMM-69): Schlüssel ist jetzt die abgeleitete `sub_phase`
// (v_claim_phase, ClaimSubPhase) statt des legacy `faelle.status`-Enums.
// Das abgeleitete 4-Phasen-Modell ist GRÖBER als die alten 19 Werte — daher
// wird großzügig gemappt: in der Regulierungs-Phase werden Kürzung/Rüge/
// Stellungnahme/Nachbesichtigung mitgezeigt (die alten Mikro-Status vs-kuerzt/
// anschlussschreiben/nachbesichtigung-laeuft kollabieren dorthin), Terminal-
// Substates zeigen ALLE Sektionen. Invariante: NIE weniger Sektionen als die
// alte fall_status-Map — Cards self-gaten ohnehin intern (Defense-in-Depth).

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
 * Entspricht der Erfassungs-Phase (sub_phase sa_offen/vollmacht_offen/onboarding_offen).
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
 * Regulierungs-Phase: großzügiges Sektions-Set. Sammelt die im abgeleiteten
 * Modell kollabierten alten Mikro-Status (regulierung + anschlussschreiben +
 * vs-kuerzt + nachbesichtigung-laeuft) → alle ihre Sektionen bleiben sichtbar.
 */
const REGULIERUNG_SECTIONS: StammdatenSection[] = [
  ...BASIS,
  'besichtigung',
  'kernwerte',
  'as-status',
  'kuerzung',
  'ruege',
  'stellungnahme',
  'nachbesichtigung',
  'regulierung',
]

const ALLE_SECTIONS = STAMMDATEN_SECTIONS as unknown as StammdatenSection[]

/**
 * Mapping abgeleitete `sub_phase` (ClaimSubPhase) → sichtbare Stammdaten-Sektionen.
 */
export const PHASE_VISIBLE_SECTIONS: Record<string, StammdatenSection[]> = {
  // ── Erfassung ────────────────────────────────────────────────────────
  sa_offen: BASIS,
  vollmacht_offen: BASIS,
  onboarding_offen: BASIS,

  // ── Begutachtung ─────────────────────────────────────────────────────
  termin: [...BASIS, 'besichtigung'],
  besichtigung: [...BASIS, 'besichtigung'],
  gutachten: [...BASIS, 'besichtigung', 'kernwerte'],
  // Kanzlei-Übergabe-Interim (begutachtung-Tail; alt kanzlei-uebergeben/filmcheck/qc)
  kanzlei_uebergabe: [...BASIS, 'besichtigung', 'kernwerte', 'as-status'],

  // ── Regulierung (großzügig, s. REGULIERUNG_SECTIONS) ─────────────────
  versicherungskontakt: REGULIERUNG_SECTIONS,
  nachforderung: REGULIERUNG_SECTIONS,
  auszahlung: [...REGULIERUNG_SECTIONS, 'auszahlung'],

  // ── Abschluss (terminal) — ALLE Sektionen (wie alt abgeschlossen/storniert/klage) ──
  erfolgreich_reguliert: ALLE_SECTIONS,
  storniert: ALLE_SECTIONS,
  klage_rechtsstreit: ALLE_SECTIONS,
  verjaehrt: ALLE_SECTIONS,
  abgelehnt_final: ALLE_SECTIONS,
  an_externe_kanzlei: ALLE_SECTIONS,
  termin_durchgefuehrt: ALLE_SECTIONS,
}

/**
 * Helper: liefert die sichtbaren Sektionen für eine abgeleitete sub_phase.
 * Unbekannte/leere sub_phase fällt auf BASIS zurück (defensive default).
 *
 * CMM-69 FLOOR (wichtig): v_claim_phase leitet die begutachtung-Phase aus
 * `auftraege.erstgutachten` ab — NICHT aus `gutachter_termine`. Fälle MIT
 * SV-Termin (oder eingegangenem Gutachten), denen (noch) ein erstgutachten-Auftrag
 * fehlt, deriven daher auf `vollmacht_offen` (Erfassung) und würden die
 * `besichtigung`/`kernwerte`-Sektion verlieren (Live 56/75 Fälle, 31.05.). Die
 * Datums-Signale `sv_termin`/`gutachten_eingegangen_am` (KEIN fall_status → b″-
 * konform) floor'n die Sektionen, sodass nie weniger sichtbar ist als unter dem
 * alten fall_status-Modell.
 */
export function getVisibleSections(
  subPhase: string | null | undefined,
  opts?: { hasTermin?: boolean; hasGutachten?: boolean },
): StammdatenSection[] {
  const base = subPhase ? PHASE_VISIBLE_SECTIONS[subPhase] ?? BASIS : BASIS
  if (!opts?.hasTermin && !opts?.hasGutachten) return base
  const set = new Set<StammdatenSection>(base)
  if (opts.hasTermin || opts.hasGutachten) set.add('besichtigung')
  if (opts.hasGutachten) set.add('kernwerte')
  // Reihenfolge stabil halten (STAMMDATEN_SECTIONS-Ordnung)
  return STAMMDATEN_SECTIONS.filter((s) => set.has(s))
}
