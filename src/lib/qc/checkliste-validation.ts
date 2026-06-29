// QC-Checkliste (Filmcheck) — Pflicht-Check-Validierung.
//
// Reine Logik (server-import-frei) -> sowohl vom Server-Action-Gate
// (qcBestanden) als auch vom Client (QcChecklisteBlock disabled-State)
// nutzbar. Behebt das "rubber-stampbare Gate": vor der Kanzlei-Uebergabe
// muessen ALLE Pflicht-Checks affirmativ auf true stehen (Nein/ungeprueft
// blockt). Filmcheck-Audit 29.06.2026.

export const MANDATORY_QC_FIELDS = [
  'gutachten_vorhanden',
  'gutachten_vollstaendig',
  'fin_17_zeichen',
  'schadenspositionen_erfasst',
  'fotos_ausreichend',
  'sa_vorhanden',
  'vollmacht_vorhanden',
  'kundendaten_vollstaendig',
  'vorschaeden_beruecksichtigt',
] as const

export type QcFieldKey = (typeof MANDATORY_QC_FIELDS)[number]

// Nutzersichtbare deutsche Labels (Toast-Fehlermeldung + UI). Umlaute echt.
export const QC_FIELD_LABELS: Record<QcFieldKey, string> = {
  gutachten_vorhanden: 'Gutachten hochgeladen',
  gutachten_vollstaendig: 'Gutachten vollständig',
  fin_17_zeichen: 'FIN 17 Zeichen',
  schadenspositionen_erfasst: 'Positionen erfasst',
  fotos_ausreichend: 'Fotos ausreichend',
  sa_vorhanden: 'SA vorhanden',
  vollmacht_vorhanden: 'Vollmacht vorhanden',
  kundendaten_vollstaendig: 'Kundendaten komplett',
  vorschaeden_beruecksichtigt: 'Vorschäden berücksichtigt',
}

export type QcCheckValues = Record<string, boolean | null | undefined>

/** Pflichtfelder, die (noch) nicht affirmativ auf true stehen. */
export function fehlendeQcFelder(checks: QcCheckValues): QcFieldKey[] {
  return MANDATORY_QC_FIELDS.filter((f) => checks[f] !== true)
}

/** True nur wenn ALLE Pflicht-Checks === true (Nein/null/undefined blockt). */
export function qcChecklisteVollstaendig(checks: QcCheckValues): boolean {
  return fehlendeQcFelder(checks).length === 0
}
