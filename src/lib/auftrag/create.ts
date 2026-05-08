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
