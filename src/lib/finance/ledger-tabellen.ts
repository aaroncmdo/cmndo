// Typsichere Ledger-Tabellen-Namen für partner_gutschriften.ledger_tabelle.
// Nach der Provisions-Ledger-Unifikation (Phase 2) tragen Provisionen + Boni die
// Union-Labels; provisionen_maik bleibt separat (SV-'gutschriften' sind ein eigenes
// System, NICHT hier). Kein 'use server' — reine Konstante (AAR-664).
export const LEDGER_TABELLEN = {
  PARTNER_PROVISIONEN: 'partner_provisionen',
  PARTNER_STAFFEL_BONUS: 'partner_staffel_bonus',
  PROVISIONEN_MAIK: 'provisionen_maik',
} as const

export type LedgerTabelle = (typeof LEDGER_TABELLEN)[keyof typeof LEDGER_TABELLEN]
