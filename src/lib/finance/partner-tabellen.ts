// SSoT: welche Tabelle haelt den EMPFAENGER einer Provision/Gutschrift je partner_typ.
//
// Vorher war das an 3 Stellen dupliziert — und zwar als stiller Fallback:
//   provision-status.ts:  partnerTyp === 'makler' ? 'makler' : 'werkstaetten'
//   partner-gutschrift.ts: PARTNER_TABLE-Map OHNE firmen_flotte  -> .from(undefined)
//   partner-gutschrift-korrektur.ts: verschachtelter Ternary     -> Fallback marketing_partner
// Ein firmen_flotte-Payout landete dadurch im werkstaetten-Lookup, fand nichts, und die
// Auszahlung brach mit "USt-Status des Partners unbekannt" (computeProvisionUst: bekannt=false).
//
// Empfaenger je Typ (Aaron 14.07. + Mig 20260714094208):
//   firmen_flotte -> `firmen` (partner_provisionen.partner_id = firmen.id). NICHT
//   firmen_flotten_konten — das ist ein reiner Zugangs-Link (unique(user_id), keine
//   Rechnungsdaten); `firmen` traegt name/ust_id/steuernummer/adresse_* + ist_kleinunternehmer.

/** partner_typ -> Empfaenger-Tabelle. Deckt beide Ledger ab (partner_provisionen + provisionen_maik). */
export const PARTNER_TABELLE = {
  makler: 'makler',
  werkstatt: 'werkstaetten',
  firmen_flotte: 'firmen',
  marketing: 'marketing_partner',
} as const

export type PartnerTyp = keyof typeof PARTNER_TABELLE

/**
 * Empfaenger-Tabelle zu einem partner_typ. `null` bei unbekanntem Typ — bewusst KEIN
 * Fallback: ein stiller Default (frueher 'werkstaetten') laesst einen falschen Payout-Lookup
 * unbemerkt durchlaufen. Caller muessen null als Fehler behandeln.
 */
export function partnerTabelleFuer(typ: string): string | null {
  return (PARTNER_TABELLE as Record<string, string>)[typ] ?? null
}
