'use server'

// AAR-637: Rückruf-Actions für die Fallakte-Sidebar. Schreibt admin_termine
// mit typ='rueckruf' + fall_id. Ein offener Rückruf pro Fall; Update-Pattern
// spiegelt Dispatch/Leads actions/rueckruf.ts.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type FallRueckrufResult = { success: boolean; error?: string }

export async function saveFallRueckruf(
  fallId: string,
  datumIso: string | null,
  notiz: string | null,
): Promise<FallRueckrufResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const nowIso = new Date().toISOString()

  if (!datumIso) {
    const { error } = await supabase
      .from('admin_termine')
      .update({ status: 'abgesagt', updated_at: nowIso })
      .eq('fall_id', fallId)
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
    if (error) return { success: false, error: error.message }
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath('/admin')
    revalidatePath('/admin/kalender')
    revalidatePath('/mitarbeiter')
    return { success: true }
  }

  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  const { data: fall } = await supabase
    .from('faelle')
    .select('fall_nummer, claims:claim_id(kundenbetreuer_id)')
    .eq('id', fallId)
    .maybeSingle()
  const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims
  const kundenbetreuerId = (fallClaim?.kundenbetreuer_id as string | null) ?? null

  const titel = `Rückruf ${fall?.fall_nummer ?? fallId.slice(0, 8)}`

  const { data: existing } = await supabase
    .from('admin_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .limit(1)
    .maybeSingle()

  const endIso = new Date(new Date(datumIso).getTime() + 15 * 60 * 1000).toISOString()

  if (existing?.id) {
    const { error } = await supabase
      .from('admin_termine')
      .update({
        titel,
        start_zeit: datumIso,
        end_zeit: endIso,
        notizen: notiz,
        updated_at: nowIso,
      })
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('admin_termine').insert({
      typ: 'rueckruf',
      titel,
      start_zeit: datumIso,
      end_zeit: endIso,
      fall_id: fallId,
      notizen: notiz,
      erstellt_von: user.id,
      zugewiesen_an: kundenbetreuerId ?? user.id,
      status: 'offen',
    })
    if (error) return { success: false, error: error.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/kalender')
  revalidatePath('/mitarbeiter')
  return { success: true }
}

export async function markFallRueckrufErledigt(fallId: string): Promise<FallRueckrufResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('admin_termine')
    .update({ status: 'erledigt', updated_at: new Date().toISOString() })
    .eq('fall_id', fallId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')

  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin')
  revalidatePath('/admin/kalender')
  revalidatePath('/mitarbeiter')
  return { success: true }
}
