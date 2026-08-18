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
      // Ohne die Verknuepfung haengt der Termin an keinem Auftrag — die Auftrags-Sicht
      // des Gutachters zeigt ihn dann nicht.
      const { error: verknuepfFehler } = await admin
        .from('gutachter_termine')
        .update({ auftrag_id: existing.id })
        .in('id', terminIds)
        .is('auftrag_id', null)
      if (verknuepfFehler) {
        console.error(`[CMM-32] Termine nicht an Auftrag ${existing.id} gehaengt:`, verknuepfFehler.message)
      }
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
    const { error: verknuepfFehler } = await admin
      .from('gutachter_termine')
      .update({ auftrag_id: inserted.id })
      .in('id', terminIds)
    if (verknuepfFehler) {
      console.error(`[CMM-32] Termine nicht an neuen Auftrag ${inserted.id} gehaengt:`, verknuepfFehler.message)
    }
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
  // CMM-49 (faelle-Drop-Runway): fall_id+sv_id via Bridge+claims statt .from('faelle').
  // bridge.fall_id == faelle.id; sv_id -> claims.sv_id (div=0).
  const { data: fallBr } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id, claims:claims!fk_bridge_claim(sv_id)')
    .eq('claim_id', claimId)
    .maybeSingle()

  if (!fallBr) return { ok: false, error: 'Fall nicht gefunden' }
  const br = fallBr as unknown as { fall_id: string; claims?: { sv_id: string | null } | { sv_id: string | null }[] | null }
  const brClaim = Array.isArray(br.claims) ? br.claims[0] : br.claims

  const { data, error } = await admin
    .from('auftraege')
    // CMM-59: status 'termin' (Lifecycle-Start) — der auftraege_status_check
    // erlaubt nur termin|besichtigung|gutachten|abgeschlossen, 'geplant' hat
    // den Insert mit CHECK-Verstoss crashen lassen.
    .insert({ fall_id: br.fall_id, sv_id: brClaim?.sv_id ?? null, typ, status: 'termin', reihenfolge: 1 })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message }
  return { ok: true, auftragId: data.id as string }
}
