// src/lib/partner-rang/config.ts
// Tunbare Gewichte/Caps/Schwellen. Startwerte fuer Cold-Start (niedrig), spaeter an reale Verteilung anpassen.
// Live-SSoT ist die DB-Tabelle partner_rang_config (via config-loader.ts).
// DEFAULT_RANG_CONFIG ist Fallback (Test + Falls DB-Zeile fehlt) -- spiegelt die 15 DB-Seeds.

/** Gewichte, Caps und Schwellen fuer die Partner-Rang-Berechnung. Wird aus DB geladen (config-loader.ts). */
export interface RangConfig {
  // Volumen
  volumenFaktor: number
  // Credentials
  credOeffentlichBestellt: number
  credProZertifikat: number
  credZertifikatCap: number
  credProJahr: number
  credTenureCap: number
  // Rating
  ratingMinBewertungen: number
  ratingCap: number
  ratingNormFloor: number
  ratingNormSpan: number
  sinnsatzTopRating: number
  // Gates
  maxNoShowQuoteGold: number
  maxNoShowQuoteSilber: number
  maxAblehnungen30d: number
  // Tier-Schwellen
  schwelleSilber: number
  schwelleGold: number
  // Sinnsatz-Volumen-Qualifizierer (nie nackte Zahl)
  volumenVielfach: number
  volumenErfahren: number
}

/** Fallback/Test-Konfiguration — spiegelt die 15 DB-Seeds in partner_rang_config. */
export const DEFAULT_RANG_CONFIG: RangConfig = {
  volumenFaktor: 8,
  credOeffentlichBestellt: 20,
  credProZertifikat: 6,
  credZertifikatCap: 12,
  credProJahr: 3,
  credTenureCap: 8,
  ratingMinBewertungen: 5,
  ratingCap: 30,
  ratingNormFloor: 3,
  ratingNormSpan: 2,
  sinnsatzTopRating: 4.3,
  maxNoShowQuoteGold: 0.08,
  maxNoShowQuoteSilber: 0.15,
  maxAblehnungen30d: 8,
  schwelleSilber: 35,
  schwelleGold: 60,
  volumenVielfach: 50,
  volumenErfahren: 15,
}
