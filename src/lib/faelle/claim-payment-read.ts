// Payment-Ledger: Lese-Helper fuer den VS-Betrag aus einem claim_payments-Embed.
// Nach der Phase-3-Collapse lesen die Reader den regulierung_betrag NICHT mehr aus dem
// claims.regulierungs_betrag-Cache, sondern Ist-first aus der (claim,'vs')-Ledger-Row.

type VsEmbedRow = {
  partei?: string | null
  forderungsbetrag?: number | null
  erhaltener_betrag?: number | null
}

/**
 * Ist-first VS-Betrag aus einem Supabase-`claim_payments`-Embed (Array ODER Objekt,
 * je nach Cardinality — daher normalisiert). Entspricht der View-Logik
 * COALESCE(vs_ist, vs_soll): erhaltener_betrag (Ist) hat Vorrang vor forderungsbetrag
 * (Soll). Liefert null, wenn keine 'vs'-Row vorhanden ist.
 *
 * Verwendung: Reader, die frueher `claims.regulierungs_betrag` (Cache) lasen und jetzt
 * den (claim,'vs')-Ledger einbetten (`claim_payments(partei, forderungsbetrag, erhaltener_betrag)`).
 */
export function vsBetragAusEmbed(claimPayments: unknown): number | null {
  const arr = Array.isArray(claimPayments) ? claimPayments : claimPayments ? [claimPayments] : []
  const vs = (arr as VsEmbedRow[]).find((p) => (p?.partei ?? 'vs') === 'vs')
  return vs?.erhaltener_betrag ?? vs?.forderungsbetrag ?? null
}
