// Kanonische Payout-Phasen, in denen die Bankdaten-Abfrage (BankdatenBanner) aktiv ist.
// PURE + client-safe (kein Server-Import) — importierbar sowohl vom 'use client'-Banner
// als auch vom Server-Loader (kunde-claim-view). Bis 2026-07 lebte diese Liste als
// privates const im BankdatenBanner; sie ist jetzt geteilt, damit Loader-Sichtbarkeit
// (GeldZone-Gate + „Bankdaten hinterlegen"-Aufgabe) exakt der Banner-Aktivheit entspricht.
export const BANKDATEN_SHOW_STATUSES = [
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung-laeuft',
  'regulierung',
] as const

/** True, wenn der Fall-Status in einer Phase ist, in der die Bankdaten-Abfrage erscheint. */
export function istBankdatenPhase(status: string | null | undefined): boolean {
  return !!status && (BANKDATEN_SHOW_STATUSES as readonly string[]).includes(status)
}
