// Pure Rang-Helfer fuer die Marketing-Community (Partner-Tier-Badge Phase 2b).
// KEIN Framework-Import -> server- UND client-safe + node-testbar. Die Rang-Daten
// kommen aus der SECURITY-DEFINER-RPC community_content_rang (gate-konforme Raenge
// fuer sichtbare, partner-authored Inhalte; kein author_id verlaesst die DB).
export type Tier = 'bronze' | 'silber' | 'gold'

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze-Partner',
  silber: 'Silber-Partner',
  gold: 'Gold-Partner',
}

export function tierLabel(tier: Tier): string {
  return TIER_LABEL[tier]
}

const TIERS: readonly string[] = ['bronze', 'silber', 'gold']

export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && TIERS.includes(v)
}

/**
 * Baut `content_id -> Tier` aus den RPC-Zeilen (community_content_rang).
 * Nur valide Tier-Werte landen in der Map; null/unbekannt wird defensiv verworfen.
 */
export function rangMapFromRows(
  rows: Array<{ content_id: string; rang: string | null }> | null | undefined,
): Map<string, Tier> {
  const map = new Map<string, Tier>()
  for (const r of rows ?? []) {
    if (r && isTier(r.rang)) map.set(r.content_id, r.rang)
  }
  return map
}
