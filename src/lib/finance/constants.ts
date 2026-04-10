// BUG-80: Zentralisierte Finance-Konstanten.
// Alle Preise, Provisionen, Splits an EINER Stelle.

export const FINANCE = {
  /** CPA Marketing-Provision pro signiertem SA (Maik) */
  CPA_MARKETING_NETTO: 150,
  /** Kanzlei-Provision pro Vollmacht */
  KANZLEI_PROVISION_NETTO: 150,
  /** Split Claimondo-Anteil */
  SPLIT_CLAIMONDO: 0.75,
  /** Split Kanzlei-Anteil */
  SPLIT_KANZLEI: 0.25,
  /** Lead-Preis Minimum (netto) */
  LEAD_PREIS_MIN_NETTO: 200,
  /** Lead-Preis Maximum (netto) */
  LEAD_PREIS_MAX_NETTO: 1081,
  /** Paket-Rabatt-Prozent auf Grundpreis */
  PAKET_RABATT_PROZENT: 25,
  /** Einzel-Preis-Aufschlag-Prozent */
  EINZEL_PREIS_PROZENT: 30,
  /** MwSt.-Satz */
  MWST_PROZENT: 19,
  /** Anzahlung pro Kontingent-Stelle (EUR) */
  ANZAHLUNG_PRO_KONTINGENT: 150,
} as const
