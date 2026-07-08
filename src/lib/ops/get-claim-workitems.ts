// src/lib/ops/get-claim-workitems.ts
// Liest v_claim_workstate (im USER-Kontext -> RLS greift) und leitet WorkItems ab.
// Ergebnis-Objekt statt throw (AGENTS.md Server-Action-Pattern).
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveClaimWorkflowState } from './derive-claim-workflow-state'
import type { ClaimWorkItem, ClaimWorkstateRow } from './claim-workstate.types'

export async function getMyClaimWorkItems(
  supabase: SupabaseClient,
  opts: { kundenbetreuerId?: string },
): Promise<{ ok: true; items: ClaimWorkItem[] } | { ok: false; error: string }> {
  let q = supabase.from('v_claim_workstate').select('*').eq('ist_aktiv', true)
  if (opts.kundenbetreuerId) q = q.eq('kundenbetreuer_id', opts.kundenbetreuerId)
  const { data, error } = await q.order('updated_at', { ascending: true })
  if (error) return { ok: false, error: (error as { message: string }).message }
  const items = (data as ClaimWorkstateRow[]).map((r) => deriveClaimWorkflowState(r))
  return { ok: true, items }
}
