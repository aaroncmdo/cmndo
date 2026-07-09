/**
 * Zentrale Paket-Definition — EINZIGE Quelle der Wahrheit (AAR-947 / W1.3).
 *
 * `preis` = voller Paketpreis. Aaron-Klarstellung 2026-06-02: die Onboarding-
 * **Anzahlung IST der volle Paketpreis** und wird als Guthaben mit den
 * Leadkosten verrechnet — es gibt KEIN 50%-Modell. Daher `anzahlung == preis`;
 * alle Beträge-Konsumenten (admin/anlegen PAKET_KONFIG, finance-hub,
 * gutachter/vertrag + gutachter/gebiet) leiten aus dem vollen Preis ab.
 */
export const PAKETE = {
  standard: { name: 'Standard', key: 'standard', radius_km: 15, faelle: 10, preis: 1500, anzahlung: 1500 },
  pro: { name: 'Pro', key: 'pro', radius_km: 40, faelle: 25, preis: 3750, anzahlung: 3750 },
  premium: { name: 'Premium', key: 'premium', radius_km: 70, faelle: 50, preis: 7500, anzahlung: 7500 },
} as const

// Pay-per-Lead-Tier: KEIN Vorab-Paket (0 Inklusivfaelle, keine Anzahlung), pro Fall
// abgerechnet — der Datensatz, den self-service-claim (sv-basic/claim-eligibility.ts:
// buildSvInsertAusLead) anlegt. BEWUSST NICHT Teil von PAKETE: dort leben nur die drei
// KAUFBAREN Pakete, ueber die Kauf-/Upgrade-UIs (gebiet, PAKET_KONFIG) iterieren — basic
// darf da nicht als "buy-up-front"-Option auftauchen. getPaket('basic') liefert stattdessen
// diesen Deskriptor, damit preis-/kontingent-/label-Konsumenten (finance-hub, gutachter/
// vertrag, gutachter/gebiet) NICHT faelschlich auf Standard (1500 EUR / 10 Faelle) zurueckfallen.
// Shape identisch zu den PAKETE-Membern → typkompatibel als getPaket-Rueckgabe.
export const BASIC_PAKET = {
  name: 'Basic', key: 'basic', radius_km: 25, faelle: 0, preis: 0, anzahlung: 0,
} as const

export type PaketKey = keyof typeof PAKETE

export function getPaket(key: string) {
  if (key === 'basic') return BASIC_PAKET
  if (key === 'starter-10' || key === 'starter' || key === 'standard') return PAKETE.standard
  if (key === 'standard-25' || key === 'pro') return PAKETE.pro
  if (key === 'premium-50' || key === 'premium') return PAKETE.premium
  return PAKETE.standard
}

export function getPaketLabel(key: string): string {
  return getPaket(key).name
}
