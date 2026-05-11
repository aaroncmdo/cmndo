// CMM-32: Erstellt einen Erstgutachten-Auftrag beim Lead → Fall-Upgrade.
// Wird in flow/[token]/actions.ts aufgerufen, sobald die Termine fall_id
// bekommen haben. Idempotent — falls schon einer existiert, return ohne
// Insert.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function createErstgutachtenAuftragWennNoetig(
  admin: SupabaseClient,
  fallId: string,
  svId: string,
  terminIds: string[],
): Promise<{ auftragId: string | null; error?: string }> {
  // Existiert schon?
  const { data: existing } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .maybeSingle()

  if (existing) {
    // Termine die noch keine auftrag_id haben dranhängen
    if (terminIds.length) {
      await admin
        .from('gutachter_termine')
        .update({ auftrag_id: existing.id })
        .in('id', terminIds)
        .is('auftrag_id', null)
    }
    return { auftragId: existing.id as string }
  }

  const { data: inserted, error } = await admin
    .from('auftraege')
    .insert({
      fall_id: fallId,
      sv_id: svId,
      typ: 'erstgutachten',
      status: 'termin',
      reihenfolge: 1,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('[CMM-32] createErstgutachtenAuftrag:', error?.message)
    return { auftragId: null, error: error?.message }
  }

  if (terminIds.length) {
    await admin
      .from('gutachter_termine')
      .update({ auftrag_id: inserted.id })
      .in('id', terminIds)
  }

  return { auftragId: inserted.id as string }
}

// Side-Quest-Aufträge: Nachbesichtigung, Stellungnahme, etc.
export type SideQuestTyp = 'nachbesichtigung' | 'stellungnahme' | 'ergaenzungsgutachten'

export async function createSideQuestAuftrag(
  admin: SupabaseClient,
  claimId: string,
  typ: SideQuestTyp,
): Promise<{ ok: boolean; auftragId?: string; error?: string }> {
  const { data: fall } = await admin
    .from('faelle')
    .select('id, sv_id')
    .eq('claim_id', claimId)
    .maybeSingle()

  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }

  const { data, error } = await admin
    .from('auftraege')
    .insert({ fall_id: fall.id as string, sv_id: fall.sv_id as string | null, typ, status: 'geplant', reihenfolge: 1 })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message }
  return { ok: true, auftragId: data.id as string }
}
