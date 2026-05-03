// CMM-32 / CMM-37: Loader-Lib für die kanzlei_faelle-Sub-Entity.
// Single Source für den Regulierungs-Lifecycle (versicherungskontakt → auszahlung).
//
// CMM-37: claim_id ist seit Phase 1 die kanonische Beziehung. fall_id wird
// vom DB-Trigger weiter parallel gepflegt, ist aber nicht mehr fuer Reads
// der erste Anlaufpunkt. getKanzleiFallByClaim ist der bevorzugte Loader;
// der Legacy-Helper getKanzleiFall(fallId) bleibt fuer Stellen, die heute
// nur die fallId zur Hand haben — er macht intern denselben Read.

import type { SupabaseClient } from '@supabase/supabase-js'

export type KanzleiFallRow = {
  id: string
  fall_id: string
  claim_id: string
  status: 'versicherungskontakt' | 'auszahlung'
  vs_kontakt_am: string | null
  ausgezahlt_am: string | null
  erstellt_am: string
  updated_at: string
}

const SELECT = 'id, fall_id, claim_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am, updated_at'

/** Kanzlei-Fall zu einem Claim (UNIQUE — null wenn noch nicht in Regulierung). */
export async function getKanzleiFallByClaim(
  supabase: SupabaseClient,
  claimId: string,
): Promise<KanzleiFallRow | null> {
  const { data, error } = await supabase
    .from('kanzlei_faelle')
    .select(SELECT)
    .eq('claim_id', claimId)
    .maybeSingle()
  if (error) {
    console.error('[kanzlei-fall/queries] getKanzleiFallByClaim:', error.message)
    return null
  }
  return (data as KanzleiFallRow | null) ?? null
}

/** Legacy: liefert den Kanzleifall ueber fall_id. Intern wird ueber den
 *  claim_id-Pfad gelesen (fall → faelle.claim_id → kanzlei_faelle.claim_id),
 *  damit die kanonische Beziehung schon hier durchschlaegt. */
export async function getKanzleiFall(
  supabase: SupabaseClient,
  fallId: string,
): Promise<KanzleiFallRow | null> {
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fall as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) return null
  return getKanzleiFallByClaim(supabase, claimId)
}
