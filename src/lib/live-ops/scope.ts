import { createClient } from '@/lib/supabase/server'
import type { LiveOpsRole, LiveOpsScope } from './types'

// Admin = alle; Dispatch = alle aktiven SVs (Pool); KB = SVs/Faelle die der KB betreut.
export async function resolveLiveOpsScope(role: LiveOpsRole, userId: string): Promise<LiveOpsScope> {
  if (role === 'admin' || role === 'dispatch') {
    return { role, userId, svIds: 'all', fallIds: 'all' }
  }
  // KB: nur betreute Faelle (v_faelle_mit_aktuellem_termin.kundenbetreuer_id) + deren SVs.
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select('claim_id, aktueller_termin_sv_id')
    .eq('kundenbetreuer_id', userId)
  const fallIds = [...new Set((data ?? []).map((r) => r.claim_id).filter(Boolean) as string[])]
  const svIds = [...new Set((data ?? []).map((r) => r.aktueller_termin_sv_id).filter(Boolean) as string[])]
  return { role, userId, svIds, fallIds }
}
