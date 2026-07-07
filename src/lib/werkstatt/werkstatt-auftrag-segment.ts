// Rollen-/Typ-Ableitungen fuer die Werkstatt-Auftrags-Ansicht (D). Rein + testbar.
// Segment = welcher Reiter (Reparatur-Auftrag vs Meine Vermittlung), abgeleitet aus
// meine_rolle (aus v_werkstatt_auftrag, gg die fragende Werkstatt berechnet).

type SegmentInput = { meine_rolle: string | null; reparatur_werkstatt_id: string | null }

/**
 * In welches Segment gehoert der Auftrag aus Sicht der fragenden Werkstatt?
 * reparateur/beide -> 'reparatur' (ich repariere, ggf. + Vermittlungsprovision),
 * vermittler -> 'vermittlung' (ich habe nur geworben). Fallback (staff/meine_rolle=NULL):
 * anhand reparatur_werkstatt_id-Praesenz.
 */
export function werkstattAuftragSegment(a: SegmentInput): 'reparatur' | 'vermittlung' {
  if (a.meine_rolle === 'reparateur' || a.meine_rolle === 'beide') return 'reparatur'
  if (a.meine_rolle === 'vermittler') return 'vermittlung'
  return a.reparatur_werkstatt_id ? 'reparatur' : 'vermittlung'
}

const ABRECHNUNGSWEG_LABEL: Record<string, 'Selbstzahler' | 'Haftpflicht' | 'Kasko'> = {
  selbstzahler: 'Selbstzahler',
  haftpflicht: 'Haftpflicht',
  kasko: 'Kasko',
}

/** DE-Label fuer den Fluss-Typ (Typ-Badge). null wenn unbekannt/leer. */
export function abrechnungswegLabel(w: string | null): 'Selbstzahler' | 'Haftpflicht' | 'Kasko' | null {
  return w ? (ABRECHNUNGSWEG_LABEL[w] ?? null) : null
}

/** Gutachten ist nur bei Versicherungs-Faellen (Haftpflicht/Kasko) relevant. */
export function zeigtGutachten(w: string | null): boolean {
  return w === 'haftpflicht' || w === 'kasko'
}

/** Zaehlt Auftraege pro Segment (fuer die Chip-Counts). */
export function zaehleSegmente(rows: SegmentInput[]): { reparatur: number; vermittlung: number } {
  let reparatur = 0
  let vermittlung = 0
  for (const r of rows) {
    if (werkstattAuftragSegment(r) === 'reparatur') reparatur++
    else vermittlung++
  }
  return { reparatur, vermittlung }
}
