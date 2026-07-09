// src/lib/partner-rang/types.ts
export type PartnerTyp = 'sachverstaendiger' | 'makler' | 'werkstatt'
export type Tier = 'bronze' | 'silber' | 'gold'

/** Eingangssignale fuer die Rang-Berechnung (typ-agnostisch; fehlende Signale = neutral). */
export interface PartnerSignals {
  typ: PartnerTyp
  /** Kumulierte abgeschlossene Faelle. */
  volumen: number
  // --- Credentials (gedeckelt) ---
  oeffentlichBestellt: boolean
  /** Anzahl vorhandener Zertifikatsnummern (BVSK/DAT/IHK/OEBUV). */
  zertifikate: number
  /** DAT-Partner (dat_nummer gesetzt). Dediziertes starkes Praeferenz-Gewicht (credDatPartner)
   *  ZUSAETZLICH zum generischen Zertifikat-Zaehler — DAT-SVs werden im Finder innerhalb ihrer
   *  Paket-Stufe bevorzugt. Optional (undefined = false) = abwaertskompatibel. */
  hatDat?: boolean
  /** Tenure in Jahren (partner_seit). */
  partnerSeitJahre: number
  // --- Rating (gedeckelt) ---
  ratingDurchschnitt: number | null
  ratingAnzahl: number
  // --- Gates ---
  /** verifiziert (SV) bzw. status=aktiv (Makler/Werkstatt). Voraussetzung fuer JEDEN Rang. */
  aktiv: boolean
  offeneReklamationen: number
  /** 0..1 */
  noShowQuote: number
  ablehnungen30d: number
}

export interface PartnerStrength {
  score: number
  volumenScore: number
  credentialScore: number
  ratingScore: number
  gateOk: boolean
  /** Hoechster gate-konformer Tier. */
  gateCap: Tier
  /** Finaler Rang; null = kein Badge (nicht aktiv). */
  tier: Tier | null
  sinnsatz: string
}
