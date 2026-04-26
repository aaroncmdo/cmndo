'use server'

// AAR-833: Gutachten-Positionen Server Actions — add, update, delete

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type PositionData = {
  bezeichnung: string
  kategorie?: 'karosserie' | 'lack' | 'mechanik' | 'glas' | 'interieur' | 'elektrik' | 'sonstiges' | null
  schadensbetrag_netto?: number | null
  schadensbetrag_brutto?: number | null
  mwst_satz?: number | null
  reparaturart?: 'instandsetzung' | 'ersatz' | 'lackierung' | 'keine' | null
  ersatzteil_nr?: string | null
  arbeitszeit_aw?: number | null
}

export async function addPosition(
  gutachtenId: string,
  claimId: string,
  data: PositionData,
): Promise<{ ok: boolean; error?: string; positionId?: string }> {
  const supabase = await createClient()

  // Nächste freie position_nr ermitteln
  const { data: letzte } = await supabase
    .from('gutachten_positionen')
    .select('position_nr')
    .eq('gutachten_id', gutachtenId)
    .order('position_nr', { ascending: false })
    .limit(1)
    .maybeSingle()

  const naechste_nr = (letzte?.position_nr ?? 0) + 1

  const { data: neu, error } = await supabase
    .from('gutachten_positionen')
    .insert({
      gutachten_id:          gutachtenId,
      claim_id:              claimId,
      position_nr:           naechste_nr,
      bezeichnung:           data.bezeichnung,
      kategorie:             data.kategorie ?? null,
      schadensbetrag_netto:  data.schadensbetrag_netto  ?? null,
      schadensbetrag_brutto: data.schadensbetrag_brutto ?? null,
      mwst_satz:             data.mwst_satz ?? 19.00,
      reparaturart:          data.reparaturart ?? null,
      ersatzteil_nr:         data.ersatzteil_nr ?? null,
      arbeitszeit_aw:        data.arbeitszeit_aw ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true, positionId: neu.id }
}

export async function updatePosition(
  positionId: string,
  data: Partial<PositionData>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gutachten_positionen')
    .update({
      ...(data.bezeichnung           != null && { bezeichnung:           data.bezeichnung }),
      ...(data.kategorie             != null && { kategorie:             data.kategorie }),
      ...(data.schadensbetrag_netto  != null && { schadensbetrag_netto:  data.schadensbetrag_netto }),
      ...(data.schadensbetrag_brutto != null && { schadensbetrag_brutto: data.schadensbetrag_brutto }),
      ...(data.mwst_satz             != null && { mwst_satz:             data.mwst_satz }),
      ...(data.reparaturart          != null && { reparaturart:          data.reparaturart }),
      ...(data.ersatzteil_nr         != null && { ersatzteil_nr:         data.ersatzteil_nr }),
      ...(data.arbeitszeit_aw        != null && { arbeitszeit_aw:        data.arbeitszeit_aw }),
    })
    .eq('id', positionId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}

export async function deletePosition(
  positionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  // gutachten_id für Renummerierung vorab holen
  const { data: pos, error: fetchErr } = await supabase
    .from('gutachten_positionen')
    .select('gutachten_id, position_nr')
    .eq('id', positionId)
    .single()

  if (fetchErr || !pos) return { ok: false, error: fetchErr?.message ?? 'Position nicht gefunden' }

  const { error } = await supabase
    .from('gutachten_positionen')
    .delete()
    .eq('id', positionId)

  if (error) return { ok: false, error: error.message }

  // Nachfolgende Positionen renummerieren (Lücken schließen)
  const { data: nachfolger } = await supabase
    .from('gutachten_positionen')
    .select('id, position_nr')
    .eq('gutachten_id', pos.gutachten_id)
    .gt('position_nr', pos.position_nr)
    .order('position_nr', { ascending: true })

  for (const n of nachfolger ?? []) {
    await supabase
      .from('gutachten_positionen')
      .update({ position_nr: n.position_nr - 1 })
      .eq('id', n.id)
  }

  revalidatePath(`/faelle`)
  return { ok: true }
}
