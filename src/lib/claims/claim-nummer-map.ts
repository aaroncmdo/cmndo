// CMM-49: faelle-freie fall_id -> claim_nummer-Aufloesung fuer Listen-Labels.
//
// claims hat KEIN fall_id. Die Map laeuft daher ueber faelle_claim_bridge in der
// erlaubten FORWARD-Richtung (fall_id -> claim_id; gleiche Richtung wie resolveClaimId)
// + claims.claim_nummer. Die Bridge ueberlebt `DROP TABLE faelle` (kein FK zu faelle).
//
// RLS-aequivalent zum bisherigen faelle.select('claims:claim_id(claim_nummer)')-Embed:
// die Bridge-RLS spiegelt die faelle-RLS, und die claims-RLS gilt fuer beide Pfade
// (der Embed wendete claims-RLS ohnehin auf die eingebettete Spalte an).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

/**
 * Roh-Aufloesung `fall_id -> claim_nummer` (nullable) via Bridge + claims.
 * `fallIds` weglassen = ALLE Bridge-Eintraege (fuer globale Admin-Listen).
 * Caller formen daraus ihre Map/Record/Array + Fallback (z.B. `?? fall_id.slice(0,8)`).
 */
export async function claimNummernForFaelle(
  client: DbClient,
  fallIds?: string[],
): Promise<{ fall_id: string; claim_nummer: string | null }[]> {
  let bridgeQuery = client.from('faelle_claim_bridge').select('fall_id, claim_id')
  if (fallIds) {
    if (fallIds.length === 0) return []
    bridgeQuery = bridgeQuery.in('fall_id', fallIds)
  }
  const { data: bridgeRows } = await bridgeQuery
  if (!bridgeRows?.length) return []

  const claimIds = bridgeRows.map((b) => b.claim_id as string)
  const { data: claimRows } = await client
    .from('claims')
    .select('id, claim_nummer')
    .in('id', claimIds)
  const nrByClaim = new Map(
    (claimRows ?? []).map((c) => [c.id as string, c.claim_nummer as string | null]),
  )

  return bridgeRows.map((b) => ({
    fall_id: b.fall_id as string,
    claim_nummer: nrByClaim.get(b.claim_id as string) ?? null,
  }))
}
