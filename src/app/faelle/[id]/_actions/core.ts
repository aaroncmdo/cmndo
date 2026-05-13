'use server'

// AAR-684 Phase 2: Fall-Lifecycle — hard-delete, deactivate, reactivate.
// KFZ-120.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteFall(fallId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // REGEL 11: NIEMALS DELETE ohne WHERE! NIEMALS mit NULL!
    if (!fallId || typeof fallId !== 'string' || fallId.length < 10) {
      return { success: false, error: 'Ungültige Fall-ID' }
    }

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (profile?.rolle !== 'admin') return { success: false, error: 'Nur Admins können Fälle löschen' }

    const { data: fall, error: findErr } = await supabase.from('faelle').select('id').eq('id', fallId).single()
    if (findErr || !fall) return { success: false, error: 'Fall nicht gefunden' }

    const { error: rpcErr } = await supabase.rpc('delete_fall_komplett', { p_fall_id: fallId })

    if (rpcErr) {
      console.error('[deleteFall] RPC error, nutze Fallback:', rpcErr.message)

      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()

      const tables = [
        'lead_historie', 'pflichtdokumente', 'qc_checkliste', 'forderungspositionen',
        'zahlungseingaenge', 'technische_probleme', 'gutachter_abrechnungspositionen',
        'gutachter_abrechnungen', 'gutachter_termine', 'gutachter_mitteilungen',
        'benachrichtigungen', 'timeline', 'tasks', 'nachrichten', 'fall_dokumente',
        'termine', 'flow_links',
      ]
      for (const table of tables) {
        try { await admin.from(table).delete().eq('fall_id', fallId) } catch { /* */ }
      }
      const { error: delErr } = await admin.from('faelle').delete().eq('id', fallId)
      if (delErr) return { success: false, error: delErr.message }
    }

    revalidatePath('/admin/faelle')
    return { success: true }
  } catch (err) {
    console.error('[deleteFall] Unerwarteter Fehler:', err)
    return { success: false, error: String(err) }
  }
}

export async function deactivateFall(
  fallId: string,
  grund: string,
  notiz: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  await supabase.from('faelle').update({
    ist_aktiv: false, deaktiviert_am: new Date().toISOString(),
    deaktiviert_grund: grund, deaktiviert_notiz: notiz || null,
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Fall deaktiviert',
    beschreibung: `Grund: ${grund}. ${notiz ? `Notiz: ${notiz}` : ''}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}

export async function reactivateFall(
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  await supabase.from('faelle').update({
    ist_aktiv: true, deaktiviert_am: null, deaktiviert_grund: null,
    deaktiviert_notiz: null, updated_at: new Date().toISOString(),
  }).eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Fall reaktiviert',
    beschreibung: 'Fall wurde reaktiviert.', erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}
