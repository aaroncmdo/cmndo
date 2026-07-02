// Assistierte QC-Review (Filmcheck #7, Phase 1a) — Auto-Ableitung der QC-Checks.
//
// Reine Logik (server-import-frei). Leitet die SICHER aus vorhandenen Daten
// berechenbaren QC-Checks ab, damit der KB beim Filmcheck nicht blind abnickt.
// Bewusst nur die eindeutigen Felder — Rest bleibt undefined (= KB-Urteil); ein
// falsches Auto-Haekchen waere schlimmer als keins. fin/kundendaten (Quelle unklar)
// + OCR-abhaengige (Positionen) folgen in spaeteren Phasen (s. Spec 2026-06-29).

import type { QcFieldKey } from './checkliste-validation'

// Pflichtdok-Slots, aus denen sa_vorhanden/vollmacht_vorhanden abgeleitet werden
// (dokument_katalog-verifiziert 29.06.2026). sa_vollmacht ist der kombinierte
// Sicherungsabtretung/Vollmacht-Slot -> deckt beide Checks ab.
export const SA_SLOTS = ['sa_vollmacht', 'sv_sicherungsabtretung'] as const
export const VOLLMACHT_SLOTS = ['halter_vollmacht', 'gf_vollmacht', 'sa_vollmacht'] as const

export type PflichtItem = { slot_id: string; vorhanden: boolean }

/** True wenn mindestens einer der gesuchten Slots vorhanden (hochgeladen/geprueft) ist. */
export function slotVorhanden(
  pflichtItems: ReadonlyArray<PflichtItem>,
  slots: ReadonlyArray<string>,
): boolean {
  return pflichtItems.some((p) => slots.includes(p.slot_id) && p.vorhanden)
}

export type QcAutoInput = {
  /** auftraege.gutachten_url gesetzt (erstgutachten). */
  gutachtenUrlVorhanden: boolean
  /** claims.vorschaden_geprueft — null = noch nicht bewertet -> nicht vorbefuellen. */
  vorschaedenGeprueft: boolean | null
  /** Pflichtdok-Status pro Slot (aus page.tsx pflichtItems). */
  pflichtItems: ReadonlyArray<PflichtItem>
  /** Phase 1b: v_claim_full.fin_vin. null/undefined = unbekannt -> fin_17_zeichen bleibt offen. */
  finVin?: string | null
  /**
   * Phase 1b: Kundendaten aus v_claim_full (Ansprechpartner-Person + Kontakt) + die
   * Besichtigungsadresse. Fehlt das Objekt -> kundendaten_vollstaendig bleibt offen.
   */
  kundendaten?: {
    vorname?: string | null
    nachname?: string | null
    email?: string | null
    telefon?: string | null
    besichtigungsadresse?: string | null
  }
}

/**
 * Auto-vorbefuellte Werte fuer die SICHER ableitbaren QC-Checks.
 * Nur enthaltene Keys werden vorbefuellt; fehlende Keys bleiben dem KB ueberlassen.
 */
export function berechneQcAutoChecks(input: QcAutoInput): Partial<Record<QcFieldKey, boolean>> {
  const out: Partial<Record<QcFieldKey, boolean>> = {
    gutachten_vorhanden: input.gutachtenUrlVorhanden,
    sa_vorhanden: slotVorhanden(input.pflichtItems, SA_SLOTS),
    vollmacht_vorhanden: slotVorhanden(input.pflichtItems, VOLLMACHT_SLOTS),
  }
  // Nur ableiten wenn der Vorschaden-Check tatsaechlich bewertet wurde.
  if (input.vorschaedenGeprueft != null) {
    out.vorschaeden_beruecksichtigt = input.vorschaedenGeprueft
  }
  // Phase 1b (02.07.): FIN nur ableiten wenn vorhanden (null = unbekannt = KB-Urteil,
  // kein Falsch-Haekchen). Eine gueltige FIN/VIN hat exakt 17 Zeichen.
  if (input.finVin != null) {
    out.fin_17_zeichen = input.finVin.trim().length === 17
  }
  // Phase 1b (02.07., Aaron): kundendaten_vollstaendig = Ansprechpartner/Person (vorname +
  // nachname — bei einer Firma der Ansprechpartner) UND Kontakt (email ODER telefon) UND
  // Besichtigungsadresse. Die Kunde-Anschrift ist bewusst NICHT verlangt (Aaron: die
  // Besichtigungsadresse ist das Wichtige, nicht die Anschrift des Kunden).
  if (input.kundendaten) {
    const k = input.kundendaten
    const hasAnsprechpartner = !!(k.vorname?.trim() && k.nachname?.trim())
    const hasKontakt = !!(k.email?.trim() || k.telefon?.trim())
    const hasBesichtigung = !!k.besichtigungsadresse?.trim()
    out.kundendaten_vollstaendig = hasAnsprechpartner && hasKontakt && hasBesichtigung
  }
  return out
}
