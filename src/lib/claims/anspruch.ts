// Anspruchs-Berechnung gegen die VS aus den OCR-Werten des Gutachtens.
//
// Der Kunde bekommt von den OCR-Daten ausschliesslich diesen einen
// abgeleiteten Eurobetrag zu sehen — alle Einzelwerte (Reparaturkosten,
// Minderwert, Restwert, WBW, …) bleiben admin-only.
//
// Logik:
//  • Totalschaden  → (Wiederbeschaffungswert − Restwert) + Minderwert
//  • Reparaturfall → Reparaturkosten brutto + Minderwert
// Nutzungsausfall + Mietwagen sind tagessatzabhängig und fliessen erst
// nach manueller Kalkulation in den Anspruch ein — bewusst NICHT hier.

export type GutachtenOcrInput = {
  reparaturkosten_brutto: number | null
  minderwert: number | null
  restwert: number | null
  wiederbeschaffungswert: number | null
  totalschaden: boolean | null
  gutachten_ocr_processed_at: string | null
}

export function berechneAnspruchVs(ocr: GutachtenOcrInput | null): number | null {
  if (!ocr || !ocr.gutachten_ocr_processed_at) return null

  const minderwert = ocr.minderwert ?? 0
  if (ocr.totalschaden) {
    const wbw = ocr.wiederbeschaffungswert
    const restwert = ocr.restwert ?? 0
    if (wbw == null) return null
    return Math.max(0, wbw - restwert) + minderwert
  }
  const brutto = ocr.reparaturkosten_brutto
  if (brutto == null) return null
  return brutto + minderwert
}
