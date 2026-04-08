'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type CreateData = {
  typ: 'rueckruf' | 'kunde' | 'intern'
  titel: string
  beschreibung?: string
  start_zeit: string
  end_zeit: string
  fall_id?: string
  erinnerung_min_vorher?: number
}

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') throw new Error('Kein Zugriff')
  return { supabase, userId: user.id }
}

export async function createAdminTermin(data: CreateData): Promise<{ id: string }> {
  const { supabase, userId } = await requireAdmin()

  const { data: inserted, error } = await supabase.from('admin_termine').insert({
    typ: data.typ,
    titel: data.titel,
    beschreibung: data.beschreibung || null,
    start_zeit: data.start_zeit,
    end_zeit: data.end_zeit,
    fall_id: data.fall_id || null,
    erstellt_von: userId,
    erinnerung_min_vorher: data.erinnerung_min_vorher ?? null,
  }).select('id').single()

  if (error) throw new Error(error.message)

  revalidatePath('/admin/kalender')
  return { id: inserted!.id }
}

export async function updateAdminTermin(id: string, data: Partial<CreateData> & { status?: string; notizen?: string }): Promise<void> {
  const { supabase } = await requireAdmin()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.typ !== undefined) updateData.typ = data.typ
  if (data.titel !== undefined) updateData.titel = data.titel
  if (data.beschreibung !== undefined) updateData.beschreibung = data.beschreibung || null
  if (data.start_zeit !== undefined) updateData.start_zeit = data.start_zeit
  if (data.end_zeit !== undefined) updateData.end_zeit = data.end_zeit
  if (data.fall_id !== undefined) updateData.fall_id = data.fall_id || null
  if (data.status !== undefined) updateData.status = data.status
  if (data.notizen !== undefined) updateData.notizen = data.notizen || null
  if (data.erinnerung_min_vorher !== undefined) updateData.erinnerung_min_vorher = data.erinnerung_min_vorher

  const { error } = await supabase.from('admin_termine').update(updateData).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/kalender')
}

export async function deleteAdminTermin(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  // REGEL 11: DELETE nur mit WHERE-Clause
  const { error } = await supabase.from('admin_termine').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/kalender')
}

export async function setAdminTerminStatus(id: string, status: 'offen' | 'erledigt' | 'abgesagt'): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('admin_termine').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/kalender')
}

export async function getAdminTermin(id: string) {
  const { supabase } = await requireAdmin()
  const { data } = await supabase.from('admin_termine').select('*').eq('id', id).single()
  return data
}
