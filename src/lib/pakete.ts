/**
 * Zentrale Paket-Definition — EINZIGE Quelle der Wahrheit (AAR-947 / W1.3).
 *
 * `preis` = voller Paketpreis. Aaron-Entscheidung 2026-06-02:
 * **die Onboarding-Anzahlung == voller Paketpreis** (`preis`), NICHT die
 * historische 50%-`anzahlung`. Beträge-Konsumenten (admin/anlegen PAKET_KONFIG,
 * finance-hub) leiten daher aus `preis` ab.
 *
 * Das Feld `anzahlung` (= 50% von `preis`) speist nur noch die SV-seitige
 * Anzeige (gutachter/vertrag "50% des Paketpreises", gutachter/gebiet
 * Upgrade-Deltas). Ob dieser 50%-Narrativ bleibt oder auf vollen Preis
 * angeglichen wird = offene, vertragsrelevante Aaron-Entscheidung
 * (siehe docs/02.06.2026/aar947-pricing-ssot-inventar.md).
 */
export const PAKETE = {
  standard: { name: 'Standard', key: 'standard', radius_km: 15, faelle: 10, preis: 1500, anzahlung: 750 },
  pro: { name: 'Pro', key: 'pro', radius_km: 40, faelle: 25, preis: 3750, anzahlung: 1875 },
  premium: { name: 'Premium', key: 'premium', radius_km: 70, faelle: 50, preis: 7500, anzahlung: 3750 },
} as const

export type PaketKey = keyof typeof PAKETE

export function getPaket(key: string) {
  if (key === 'starter-10' || key === 'starter' || key === 'standard') return PAKETE.standard
  if (key === 'standard-25' || key === 'pro') return PAKETE.pro
  if (key === 'premium-50' || key === 'premium') return PAKETE.premium
  return PAKETE.standard
}

export function getPaketLabel(key: string): string {
  return getPaket(key).name
}
