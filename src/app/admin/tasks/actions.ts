'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const fallId = formData.get('fall_id') as string
  const typ = formData.get('typ') as string
  const titel = formData.get('titel') as string
  const beschreibung = (formData.get('beschreibung') as string) || null
  const faelligAm = (formData.get('faellig_am') as string) || null
  const zugewiesenAn = (formData.get('zugewiesen_an') as string) || null

  if (!fallId || !typ || !titel) {
    throw new Error('Fall, Typ und Titel sind Pflichtfelder')
  }

  const { error } = await supabase.from('tasks').insert({
    fall_id: fallId,
    typ,
    titel,
    beschreibung,
    faellig_am: faelligAm || null,
    zugewiesen_an: zugewiesenAn || null,
    status: 'offen',
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/aufgaben/alle')
}

export async function updateTaskStatus(taskId: string, newStatus: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const updateData: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'erledigt') {
    updateData.erledigt_am = new Date().toISOString()
  }

  // Fetch task before update so we know its type and fall_id
  const { data: task } = await supabase
    .from('tasks')
    .select('id, typ, fall_id')
    .eq('id', taskId)
    .single()

  if (!task) throw new Error('Task nicht gefunden')

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  // Auto-create follow-up: filmcheck → kanzlei-anschlussschreiben
  if (newStatus === 'erledigt' && task.typ === 'filmcheck') {
    await supabase.from('tasks').insert({
      fall_id: task.fall_id,
      typ: 'kanzlei-anschlussschreiben',
      titel: 'Anschlussschreiben an Kanzlei senden',
      beschreibung: 'Automatisch erstellt nach abgeschlossenem Filmcheck.',
      status: 'offen',
    })
  }

  revalidatePath('/admin/aufgaben/alle')
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/aufgaben/alle')
}
