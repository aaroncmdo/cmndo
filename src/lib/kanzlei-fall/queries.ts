// CMM-32: Loader-Lib für die kanzlei_faelle-Sub-Entity.
// Single Source für den Regulierungs-Lifecycle (versicherungskontakt → auszahlung).

import type { SupabaseClient } from '@supabase/supabase-js'

export type KanzleiFallRow = {
  id: string
  fall_id: string
  status: 'versicherungskontakt' | 'auszahlung'
  vs_kontakt_am: string | null
  ausgezahlt_am: string | null
  erstellt_am: string
  updated_at: string
}

const SELECT = 'id, fall_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am, updated_at'

/** Kanzlei-Fall zu einem fall (UNIQUE — null wenn noch nicht in Regulierung). */
export async function getKanzleiFall(
  supabase: SupabaseClient,
  fallId: string,
): Promise<KanzleiFallRow | null> {
  const { data, error } = await supabase
    .from('kanzlei_faelle')
    .select(SELECT)
    .eq('fall_id', fallId)
    .maybeSingle()
  if (error) {
    console.error('[kanzlei-fall/queries] getKanzleiFall:', error.message)
    return null
  }
  return (data as KanzleiFallRow | null) ?? null
}
