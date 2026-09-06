// src/lib/status/domains/fall-status.ts
// faelle.status registry domain. Label+short imported from the legacy map
// (single source until the cleanup wave); slot mapping owned here.
import type { StatusDef, StatusSlot } from '../types'
import { FALL_STATUS_LABELS, FALL_STATUS_LABELS_SHORT } from '@/lib/statusLabels'

const SLOT: Record<string, StatusSlot> = {
  ersterfassung: 'neutral',
  'flow-gesendet': 'active',
  onboarding: 'neutral',
  erstgespraech: 'active',
  'sv-gesucht': 'active',
  'termin-reserviert': 'pending',
  'besichtigung-laeuft': 'active',
  'gutachten-bearbeitung': 'active',
  'gutachten-erstellt': 'done',
  'akte-uebergeben': 'active',
  'as-vorbereitung': 'active',
  'as-versendet': 'active',
  'warten-auf-vs': 'pending',
  'vs-kuerzt': 'warning',
  'vs-reguliert': 'success',
  klage: 'danger',
  'sv-zugewiesen': 'active',
  'sv-termin': 'pending',
  besichtigung: 'active',
  'begutachtung-laeuft': 'active',
  'gutachten-eingegangen': 'done',
  filmcheck: 'active',
  'qc-pruefung': 'active',
  'kanzlei-uebergeben': 'active',
  anschlussschreiben: 'active',
  'as-gesendet': 'active',
  regulierung: 'success',
  'regulierung-laeuft': 'success',
  'nachbesichtigung-laeuft': 'active',
  'vs-regulierung': 'success',
  'vs-abgelehnt': 'danger',
  // B4-slice-1b: aktive VS-Verhandlung — kein Endzustand, daher 'active'.
  in_kommunikation_vs: 'active',
  termin_durchgefuehrt: 'success',
  'zahlung-eingegangen': 'success',
  abgeschlossen: 'success',
  storniert: 'danger',
  in_bearbeitung: 'pending',
  vs_kontakt: 'pending',
  reguliert: 'success',
  abgelehnt: 'danger',
  kanzlei: 'active',
  // B4/T4-Followup: operative_status-Terminals + Reparatur-Lane (sonst 'neutral'-Default).
  // Terminal-Slots bit-gleich zur claims-status-Domain (CLAIMS_STATUS_DEFS).
  reguliert_vollstaendig: 'success',
  klage_rechtsstreit: 'warning',
  verjaehrt: 'neutral',
  abgelehnt_final: 'danger',
  an_externe_kanzlei_uebergeben: 'done',
  'reparatur-werkstatt-suche': 'active',
  'reparatur-angefragt': 'pending',
  'reparatur-laeuft': 'active',
  'reparatur-erledigt': 'done',
}

/**
 * Kundensprache. `FALL_STATUS_LABELS` ist die Mitarbeiter-Sicht („Begutachtung
 * läuft", „QC-Prüfung") — Branchenvokabular, das ein Unfallgeschädigter nicht
 * kennt. PRODUCT.md, Prinzip 4: „Die Sprache des Geschädigten, nicht die der
 * Branche."
 *
 * Anlass (Frontend-Audit 30.08., prod): Die Kunden-Mitteilungen zeigten den
 * **rohen Slug** — „Neuer Status: filmcheck", „Neuer Status: begutachtung-laeuft"
 * (mit Bindestrich und ohne Umlaut). Zehnmal untereinander in der Fallakte.
 *
 * Formuliert aus Sicht des Kunden: was ist gerade mit SEINEM Vorgang passiert.
 * Duzen, weil das Kundenportal überwiegend duzt.
 */
const KUNDE_LABEL: Record<string, string> = {
  // Erfassung
  ersterfassung: 'Ihre Schadenmeldung ist eingegangen',
  onboarding: 'Ihre Angaben werden vervollständigt',
  'flow-gesendet': 'Wir haben Ihnen Ihren Link geschickt',
  // Gutachter finden und Termin
  'sv-gesucht': 'Wir suchen einen Gutachter für Sie',
  'sv-zugewiesen': 'Ihr Gutachter steht fest',
  'termin-reserviert': 'Ihr Termin ist reserviert',
  'sv-termin': 'Ihr Termin steht',
  // Begutachtung
  besichtigung: 'Ihr Auto wird begutachtet',
  'besichtigung-laeuft': 'Ihr Auto wird begutachtet',
  'begutachtung-laeuft': 'Ihr Gutachten wird erstellt',
  'gutachten-bearbeitung': 'Ihr Gutachten wird erstellt',
  termin_durchgefuehrt: 'Die Begutachtung ist erledigt',
  'gutachten-erstellt': 'Ihr Gutachten ist fertig',
  'gutachten-eingegangen': 'Ihr Gutachten ist da',
  // Interne Prüfung — für den Kunden EIN Zustand, nicht drei
  filmcheck: 'Wir prüfen Ihr Gutachten',
  'qc-pruefung': 'Wir prüfen Ihr Gutachten',
  // Kanzlei und Versicherung
  'kanzlei-uebergeben': 'Ihre Kanzlei übernimmt',
  'akte-uebergeben': 'Ihre Kanzlei übernimmt',
  anschlussschreiben: 'Wir haben die Versicherung angeschrieben',
  'as-versendet': 'Wir haben die Versicherung angeschrieben',
  'as-gesendet': 'Wir haben die Versicherung angeschrieben',
  'as-vorbereitung': 'Ihr Anspruch wird vorbereitet',
  'warten-auf-vs': 'Wir warten auf die Versicherung',
  in_kommunikation_vs: 'Wir verhandeln mit der Versicherung',
  'vs-kuerzt': 'Die Versicherung will kürzen — wir prüfen das',
  'nachbesichtigung-laeuft': 'Es wird noch einmal nachgeschaut',
  // Geld
  regulierung: 'Die Versicherung reguliert',
  'regulierung-laeuft': 'Die Versicherung reguliert',
  'vs-regulierung': 'Die Versicherung reguliert',
  'vs-reguliert': 'Die Versicherung hat vollständig gezahlt',
  reguliert_vollstaendig: 'Die Versicherung hat vollständig gezahlt',
  'zahlung-eingegangen': 'Das Geld ist eingegangen',
  // Reparatur
  'reparatur-werkstatt-suche': 'Sie suchen Ihnen eine Werkstatt aus',
  'reparatur-angefragt': 'Die Werkstatt ist angefragt',
  'reparatur-laeuft': 'Ihr Auto wird repariert',
  'reparatur-erledigt': 'Ihr Auto ist fertig',
  // Ende
  abgeschlossen: 'Ihr Fall ist abgeschlossen',
  storniert: 'Ihr Fall wurde gestoppt',
  'vs-abgelehnt': 'Die Versicherung hat abgelehnt',
  abgelehnt: 'Die Versicherung hat abgelehnt',
  abgelehnt_final: 'Die Versicherung hat endgültig abgelehnt',
  klage: 'Ihre Kanzlei geht vor Gericht',
  klage_rechtsstreit: 'Ihre Kanzlei geht vor Gericht',
  an_externe_kanzlei_uebergeben: 'An Ihre Kanzlei übergeben',
}

export const FALL_STATUS_DEFS: Record<string, StatusDef> = Object.fromEntries(
  Object.keys(FALL_STATUS_LABELS).map((code) => [
    code,
    {
      label: FALL_STATUS_LABELS[code],
      short: FALL_STATUS_LABELS_SHORT[code],
      slot: SLOT[code] ?? 'neutral',
      ...(KUNDE_LABEL[code] ? { labelByRole: { kunde: KUNDE_LABEL[code] } } : {}),
    } satisfies StatusDef,
  ]),
)
