'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateGutachterProfil(
  svId: string,
  field: string,
  value: unknown,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: true, deaktiviert_grund: null, deaktiviert_am: null })
    .eq('id', svId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}

export async function deactivateGutachter(svId: string, grund: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: false, deaktiviert_grund: grund || 'Manuell deaktiviert', deaktiviert_am: new Date().toISOString() })
    .eq('id', svId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/karte')
}

export async function reassignCases(fromSvId: string, toSvId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data: { user } } = await supabase.auth.getUser()
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

  // Soft-delete: mark as deleted
  const { error } = await supabase
    .from('sachverstaendige')
    .update({ ist_aktiv: false, geloescht_am: new Date().toISOString() })
    .eq('id', svId)

  if (error) throw new Error(error.message)

  // Timeline entry
  try {
    const { data: sv } = await supabase.from('sachverstaendige').select('profile_id').eq('id', svId).single()
    const { data: profile } = sv?.profile_id
      ? await supabase.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
      : { data: null }
    const svName = profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : 'Unbekannt'
    const { data: adminProfile } = await supabase.from('profiles').select('vorname, nachname').eq('id', user.id).single()
    const adminName = adminProfile ? `${adminProfile.vorname ?? ''} ${adminProfile.nachname ?? ''}`.trim() : 'Admin'
    await supabase.from('timeline').insert({ typ: 'system', titel: 'Gutachter gelöscht', beschreibung: `${svName} wurde gelöscht von ${adminName}` })
  } catch { /* timeline may not accept this format */ }

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
