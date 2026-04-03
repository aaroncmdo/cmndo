'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateGutachterProfil(
  svId: string,
  field: string,
  value: unknown,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Fields that live on the profiles table (via profile_id)
  const profileFields = ['telefon', 'email', 'vorname', 'nachname']

  if (profileFields.includes(field)) {
    // Get profile_id from sachverstaendige
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .single()

    if (!sv?.profile_id) throw new Error('Gutachter-Profil nicht gefunden')

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', sv.profile_id)

    if (error) throw new Error(error.message)
  } else {
    // Fields on sachverstaendige table
    const { error } = await supabase
      .from('sachverstaendige')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', svId)

    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}

export async function reactivateGutachter(svId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Core update (ist_aktiv always exists)
  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: true })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  // Try clearing deactivation fields (columns may not exist yet)
  try {
    await supabase.from('sachverstaendige').update({ deaktiviert_grund: null, deaktiviert_am: null }).eq('id', svId)
  } catch { /* columns may not exist */ }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}

export async function deactivateGutachter(svId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Core update (ist_aktiv always exists)
  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: false })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  // Try setting deactivation details (columns may not exist yet)
  try {
    await supabase.from('sachverstaendige').update({ deaktiviert_grund: grund || 'Manuell deaktiviert', deaktiviert_am: new Date().toISOString() }).eq('id', svId)
  } catch { /* columns may not exist */ }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}

export async function reassignCases(fromSvId: string, toSvId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data, error } = await supabase
    .from('faelle')
    .update({ sv_id: toSvId })
    .eq('sv_id', fromSvId)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .select('id')

  if (error) throw new Error(error.message)
  revalidatePath('/admin/sachverstaendige')
  return { count: data?.length ?? 0 }
}

export async function softDeleteGutachter(svId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Check for open cases
  const { count } = await supabase
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', svId)
    .not('status', 'in', '("abgeschlossen","storniert")')

  if ((count ?? 0) > 0) {
    throw new Error(`Noch ${count} offene Fälle. Bitte zuerst umverteilen.`)
  }

  // Soft-delete: deactivate (ist_aktiv always exists)
  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: false })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  // Try setting geloescht_am + deaktiviert_grund (columns may not exist yet)
  try {
    await supabase.from('sachverstaendige').update({
      geloescht_am: new Date().toISOString(),
      deaktiviert_grund: 'Manuell gelöscht durch Admin',
    }).eq('id', svId)
  } catch { /* columns may not exist */ }

  // Delete the auth user completely so they can never log in again
  try {
    const { data: svData } = await supabase.from('sachverstaendige').select('user_id, profile_id').eq('id', svId).single()
    const authUserId = svData?.user_id ?? svData?.profile_id
    if (authUserId) {
      const admin = createAdminClient()
      await admin.auth.admin.deleteUser(authUserId)
    }
  } catch { /* service role key may not be set, or user already deleted */ }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
  revalidatePath('/admin/finance')
}

export async function getOpenCasesCount(svId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', svId)
    .not('status', 'in', '("abgeschlossen","storniert")')
  return count ?? 0
}

// ─── KFZ-122: Gutachter endgültig löschen (NUR deaktivierte) ─────────────

export async function deleteGutachter(svId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!svId || typeof svId !== 'string' || svId.length < 10) {
      return { success: false, error: 'Ungültige SV-ID' }
    }

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    // Nur Admins dürfen löschen
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (profile?.rolle !== 'admin') return { success: false, error: 'Nur Admins können Gutachter löschen' }

    // Existenz + Deaktiviert prüfen
    const { data: sv } = await supabase.from('sachverstaendige').select('id, ist_aktiv').eq('id', svId).single()
    if (!sv) return { success: false, error: 'Gutachter nicht gefunden' }
    if (sv.ist_aktiv !== false) return { success: false, error: 'Nur deaktivierte Gutachter können gelöscht werden' }

    const { error } = await supabase.rpc('delete_gutachter_komplett', { p_sv_id: svId })
    if (error) {
      console.error('[deleteGutachter] RPC error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/admin/sachverstaendige')
    revalidatePath('/admin/karte')
    return { success: true }
  } catch (err) {
    console.error('[deleteGutachter] Fehler:', err)
    return { success: false, error: String(err) }
  }
}
