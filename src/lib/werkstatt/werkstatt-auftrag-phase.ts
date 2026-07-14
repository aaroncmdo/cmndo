// Ableitung EINES normalisierten Auftrag-Status + Anzeige-Labels fuer die
// einheitliche Werkstatt-Auftragsansicht. Konsumiert die v_werkstatt_auftrag-
// Zeilenfelder (Subset von WerkstattAuftrag). Pure + testbar.
// Vorbild: reparatur-termin-phase.ts (SP2).
//
// Warum: die View haelt Status aus 5 Subsystemen (operative_status,
// besichtigung, reparatur_termin_status, Gutachten-fertig, vermittlung_status).
// Der Werkstatt 5 rohe Enum-Status zu zeigen ist verwirrend -> EIN abgeleiteter
// Status pro Zeile (Praezedenz: der kritischste/weiteste Reparatur-relevante
// Stand gewinnt). Enum-Werte prod-verifiziert gegen v_werkstatt_auftrag +
// fall_status (19 Werte) + reparatur_termine.status.

export type WerkstattAuftragTon = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type WerkstattAuftragPhaseKey =
  | 'neu'
  | 'besichtigung'
  | 'gutachten_da'
  | 'totalschaden'
  | 'termin_offen'
  | 'termin_bestaetigt'
  | 'erledigt'
  | 'abgelehnt'

export interface WerkstattAuftragPhase {
  key: WerkstattAuftragPhaseKey
  label: string
  ton: WerkstattAuftragTon
}

/** Nur die von der Ableitung gelesenen Felder (strukturelles Subset von WerkstattAuftrag). */
export interface WerkstattAuftragPhaseInput {
  reparatur_termin_status: string | null
  gutachten_fertiggestellt_am: string | null
  gutachten_totalschaden: boolean | null
  operative_status: string | null
  besichtigung_start: string | null
}

/** Metadaten je Phase (Label + Badge-Ton) — auch fuer die Filter-Chips genutzt. */
export const WERKSTATT_PHASE_META: Record<
  WerkstattAuftragPhaseKey,
  { label: string; ton: WerkstattAuftragTon }
> = {
  neu: { label: 'Neu', ton: 'neutral' },
  besichtigung: { label: 'Besichtigung', ton: 'info' },
  gutachten_da: { label: 'Gutachten liegt vor', ton: 'info' },
  totalschaden: { label: 'Totalschaden', ton: 'danger' },
  termin_offen: { label: 'Termin offen', ton: 'warning' },
  termin_bestaetigt: { label: 'Termin bestätigt', ton: 'success' },
  erledigt: { label: 'Erledigt', ton: 'success' },
  abgelehnt: { label: 'Termin abgelehnt', ton: 'danger' },
}

/** Filter-/Anzeige-Reihenfolge (Reparatur-Lifecycle-Progression). */
export const WERKSTATT_PHASE_ORDER: WerkstattAuftragPhaseKey[] = [
  'neu',
  'besichtigung',
  'gutachten_da',
  'totalschaden',
  'termin_offen',
  'termin_bestaetigt',
  'erledigt',
  'abgelehnt',
]

function phase(key: WerkstattAuftragPhaseKey): WerkstattAuftragPhase {
  return { key, ...WERKSTATT_PHASE_META[key] }
}

/**
 * Leitet EINEN Anzeige-Status aus den Subsystem-Status ab. Praezedenz:
 * Termin-Endzustaende (abgelehnt/erledigt/bestaetigt) > Termin offen >
 * Gutachten (Totalschaden > liegt vor) > Besichtigung > Neu.
 * Der weiteste/kritischste Reparatur-relevante Stand gewinnt.
 */
export function werkstattAuftragPhase(row: WerkstattAuftragPhaseInput): WerkstattAuftragPhase {
  const rts = row.reparatur_termin_status
  if (rts === 'storniert' || rts === 'abgelehnt') return phase('abgelehnt')
  if (rts === 'erledigt') return phase('erledigt')
  if (rts === 'bestaetigt') return phase('termin_bestaetigt')
  if (rts === 'angefragt' || rts === 'anruf_erbeten') return phase('termin_offen')
  if (row.gutachten_fertiggestellt_am && row.gutachten_totalschaden) return phase('totalschaden')
  if (row.gutachten_fertiggestellt_am) return phase('gutachten_da')
  if (row.operative_status === 'sv-termin' || row.besichtigung_start) return phase('besichtigung')
  return phase('neu')
}

// ─── Label-Normalisierung (die restlichen rohen Enum-Werte) ──────────────────

/** richtung: die Sprache der Filterbubble. inbound = Werkstatt bringt Kunde (QR), vermittelt = Claimondo-Auftrag. */
export const RICHTUNG_LABEL: Record<string, string> = {
  inbound: 'Meine Vermittlung',
  vermittelt: 'Auftrag',
}
export function richtungLabel(r: string | null): string {
  if (!r) return '–'
  return RICHTUNG_LABEL[r] ?? r
}

/** reparaturwunsch: reparatur/fiktiv (unentschieden defensiv). null = nichts anzeigen. */
export const REPARATURWUNSCH_LABEL: Record<string, string> = {
  reparatur: 'Reparatur',
  fiktiv: 'Fiktiv',
  unentschieden: 'Unentschieden',
}
export function reparaturwunschLabel(w: string | null): string | null {
  if (!w) return null
  return REPARATURWUNSCH_LABEL[w] ?? w
}

/** operative_status: interner Fall-Lifecycle-Cursor (fall_status, 19 Werte) — Sekundaer-Detail. */
export const OPERATIVE_STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'In Erfassung',
  onboarding: 'Onboarding',
  'sv-gesucht': 'Gutachter gesucht',
  'sv-zugewiesen': 'Gutachter zugewiesen',
  'sv-termin': 'Gutachter-Termin',
  besichtigung: 'Besichtigung',
  'begutachtung-laeuft': 'Begutachtung läuft',
  'gutachten-eingegangen': 'Gutachten eingegangen',
  filmcheck: 'Filmcheck',
  'qc-pruefung': 'QC-Prüfung',
  'kanzlei-uebergeben': 'An Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  'regulierung-laeuft': 'Regulierung läuft',
  'nachbesichtigung-laeuft': 'Nachbesichtigung läuft',
  'zahlung-eingegangen': 'Zahlung eingegangen',
  'vs-abgelehnt': 'Versicherung abgelehnt',
  // B4-slice-1b: sonst greift der Slug-Fallback unten und die Werkstatt liest „In kommunikation vs".
  in_kommunikation_vs: 'Regulierung läuft',
  abgelehnt: 'Versicherung hat abgelehnt',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}
export function operativeStatusLabel(s: string | null): string | null {
  if (!s) return null
  return OPERATIVE_STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')
}
