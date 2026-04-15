// AAR-136 / W2: Zentrale Qualifizierungs-Engine (Pure Logic).
// Ersetzt hard-gate-utils.ts und konsolidiert die über 3 Stellen verteilte
// Logik (hardGateOk / hasSvTermin etc.). Die Notion-Spec 14.04.2026 definiert
// 6 Bedingungen die ALLE erfüllt sein müssen bevor der FlowLink versendet wird.

export type LeadLike = {
  // Phase 1: Hard Gate
  unfallhergang?: string | null
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung' | string | null
  aufklaerung_teilschuld_bestaetigt?: boolean | null
  schaden_sichtbar?: boolean | null
  personenschaden_flag?: boolean | null
  mietwagen_flag?: boolean | null
  nutzungsausfall?: boolean | null
  hat_haftpflicht?: boolean | null
  qualifizierungs_phase?: string | null
  // Phase 1 erweitert (AAR-124)
  polizei_vor_ort?: boolean | null
  // Phase 3
  schadentyp?: string | null
  parkplatz_kamera?: boolean | null
  // Phase 4 / Gegner
  gegner_kennzeichen?: string | null
  fahrerflucht?: boolean | null
  // AAR-176: Treffpunkt-Hinweis für den SV (Phase 2)
  sv_treffpunkt?: string | null
  // AAR-181: Fahrzeug-Stammdaten die Phase 4 als Pflichtfelder prüft
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  fahrzeug_baujahr?: number | null
  // AAR-181 Audit-Fix #5: erstzulassung (DD.MM.YYYY) aus ZB1-OCR, kann als
  // Fallback für Baujahr-Ableitung genutzt werden wenn fahrzeug_baujahr null
  erstzulassung?: string | null
}

export type AktiverTerminLike = {
  status?: string
} | null

export type QualificationResult = {
  /** Q1: schuldfrage gesetzt, nicht eigenverantwortung, bei unklar mit Aufklärungs-Bestätigung */
  q1_schuldfrage: boolean
  /** Q2: Schaden sichtbar ODER mindestens ein Schaden-Indikator-Flag */
  q2_schaden: boolean
  /** Q3 (AAR-124): Polizei-vor-Ort wurde beantwortet (true ODER false — nicht null) */
  q3_polizei: boolean
  /** Q4: Schadentyp gesetzt */
  q4_schadentyp: boolean
  /** Q5: SV + Termin reserviert (status 'reserviert' oder 'bestaetigt') */
  q5_svTermin: boolean
  /** Q6: Gegner-KZ vorhanden ODER Parkplatz-Kamera=true ODER (Fahrerflucht + Polizei) */
  q6_gegnerKz: boolean
  /** AAR-181 Q7: Fahrzeug-Pflichtfelder (KZ, Marke, Modell, Baujahr) alle gesetzt */
  q7_fahrzeug: boolean
  /** Alle 7 Bedingungen erfüllt */
  allComplete: boolean
  /** FlowLink-Versand erlaubt (aktuell === allComplete) */
  canSendFlowLink: boolean
  /** Wie viele der 7 Bedingungen bereits erfüllt sind (0-7) */
  completedCount: number
  /** Lead wurde explizit disqualifiziert */
  disqualifiziert: boolean
}

export function computeQualificationStatus(
  lead: LeadLike,
  aktiverTermin: AktiverTerminLike,
): QualificationResult {
  const q1_schuldfrage =
    !!lead.unfallhergang &&
    !!lead.schuldfrage &&
    lead.schuldfrage !== 'eigenverantwortung' &&
    (lead.schuldfrage !== 'unklar' || lead.aufklaerung_teilschuld_bestaetigt === true)

  // Schaden: sichtbar=true ODER mindestens 1 Indikator-Flag gesetzt
  const q2_schaden =
    lead.schaden_sichtbar === true ||
    lead.personenschaden_flag === true ||
    lead.mietwagen_flag === true ||
    lead.nutzungsausfall === true

  // Q3 Polizei-vor-Ort ist beantwortet (nicht null/undefined)
  const q3_polizei = lead.polizei_vor_ort === true || lead.polizei_vor_ort === false

  const q4_schadentyp = !!lead.schadentyp && lead.schadentyp.trim().length > 0

  const q5_svTermin =
    aktiverTermin?.status === 'reserviert' || aktiverTermin?.status === 'bestaetigt'

  // Gegner-KZ-Logik: Kennzeichen vorhanden ODER Parkplatz mit Kamera ODER
  // Fahrerflucht mit Polizei-Einsatz (Aktenzeichen über Polizei nachforderbar)
  const q6_gegnerKz =
    !!lead.gegner_kennzeichen?.trim() ||
    lead.parkplatz_kamera === true ||
    (lead.fahrerflucht === true && lead.polizei_vor_ort === true)

  // AAR-181: Fahrzeug-Pflichtfelder in Phase 4.
  // Baujahr wird jetzt explizit verlangt damit Fallakte + Gutachter die
  // Info direkt haben (vorher nur optional in Fallakte nachgetragen).
  const q7_fahrzeug =
    !!lead.kennzeichen?.trim() &&
    !!lead.fahrzeug_hersteller?.trim() &&
    !!lead.fahrzeug_modell?.trim() &&
    lead.fahrzeug_baujahr != null

  const disqualifiziert = lead.qualifizierungs_phase === 'disqualifiziert'

  const flags = [
    q1_schuldfrage, q2_schaden, q3_polizei,
    q4_schadentyp, q5_svTermin, q6_gegnerKz, q7_fahrzeug,
  ]
  const completedCount = flags.filter(Boolean).length
  const allComplete = completedCount === flags.length && !disqualifiziert

  return {
    q1_schuldfrage,
    q2_schaden,
    q3_polizei,
    q4_schadentyp,
    q5_svTermin,
    q6_gegnerKz,
    q7_fahrzeug,
    allComplete,
    canSendFlowLink: allComplete,
    completedCount,
    disqualifiziert,
  }
}
