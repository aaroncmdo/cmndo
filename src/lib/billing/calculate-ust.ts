/**
 * AAR-416: USt-Berechnung in Cent-Arithmetik — vermeidet Floating-Point-
 * Rundungsfehler auf Rechnungs-Summen.
 *
 * Default 19% UStG. Bei Rechnungs-Konfig-Anpassung (ermäßigt 7%) kann der
 * Satz explizit übergeben werden.
 */
export type UstBreakdown = {
  netto_cent: number
  ust_cent: number
  brutto_cent: number
  ust_satz_pct: number
}

export function calculateUst(
  netto_cent: number,
  ust_satz_pct: number = 19,
): UstBreakdown {
  if (!Number.isInteger(netto_cent) || netto_cent < 0) {
    throw new Error(`[AAR-416] calculateUst: netto_cent muss nicht-negative Ganzzahl sein (got ${netto_cent})`)
  }
  // Mathematisch korrekte Rundung auf ganze Cent (kaufmännisch).
  const ust_cent = Math.round((netto_cent * ust_satz_pct) / 100)
  const brutto_cent = netto_cent + ust_cent
  return { netto_cent, ust_cent, brutto_cent, ust_satz_pct }
}

/**
 * Convenience: Euro (Number) → Cent (Integer). Rundet kaufmännisch.
 */
export function eurToCent(euro: number): number {
  return Math.round(euro * 100)
}

export function centToEur(cent: number): number {
  return cent / 100
}

/**
 * Formatiert Cent-Betrag als "1.234,56 €" für PDF/Email.
 */
export function formatCentAsEur(cent: number): string {
  const eur = centToEur(cent)
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(eur) + ' \u20AC'
}
