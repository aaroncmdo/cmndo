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

// ─── KVA-Status (Kostenvoranschlag) ──────────────────────────────────────────
// Erster Schritt der Werkstatt bei Selbstzahler-/Kasko-Direkt-Reparaturen: einen
// Kostenvoranschlag ausstellen. benoetigt -> erstellt(EUR) -> freigegeben.

export type KvaStatus = 'benoetigt' | 'erstellt' | 'freigegeben'

type KvaInput = {
  meine_rolle: string | null
  reparatur_werkstatt_id: string | null
  gutachten_fertiggestellt_am: string | null
  reparatur_freigegeben_am: string | null
  kostenvoranschlag_netto: number | null
  kostenvoranschlag_brutto: number | null
}

/**
 * KVA-Status aus Sicht der reparierenden Werkstatt — null, wenn KVA nicht relevant.
 * KVA nur im Reparatur-Segment OHNE SV-Gutachten (Selbstzahler/Kasko-direkt): bei
 * Vermittlung ODER Gutachten-basiert (Haftpflicht) ist die Kostenbasis das Gutachten.
 */
export function kvaStatus(a: KvaInput): KvaStatus | null {
  if (werkstattAuftragSegment(a) !== 'reparatur') return null
  if (a.gutachten_fertiggestellt_am != null) return null
  if (a.reparatur_freigegeben_am != null) return 'freigegeben'
  if (a.kostenvoranschlag_netto != null || a.kostenvoranschlag_brutto != null) return 'erstellt'
  return 'benoetigt'
}

/** DE-Label fuer den KVA-Status (Badge-Text). */
export function kvaStatusLabel(s: KvaStatus): string {
  return { benoetigt: 'KVA benötigt', erstellt: 'KVA erstellt', freigegeben: 'KVA freigegeben' }[s]
}

/** Gutachten ist nur bei Versicherungs-Faellen (Haftpflicht/Kasko) relevant. */
export function zeigtGutachten(w: string | null): boolean {
  return w === 'haftpflicht' || w === 'kasko'
}

const QUELLE_LABEL: Record<string, string> = {
  dispatcher: 'Dispatcher',
  kunde: 'Kunde',
  embed: 'Online-Finder',
  gutachter: 'Gutachter',
  kb: 'Kundenbetreuung',
  qr_referral: 'QR-Empfehlung',
}

/** DE-Label fuer die Vermittlungs-Quelle (reparatur_werkstatt_quelle). null wenn leer. */
export function quelleLabel(q: string | null): string | null {
  return q ? (QUELLE_LABEL[q] ?? q) : null
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
