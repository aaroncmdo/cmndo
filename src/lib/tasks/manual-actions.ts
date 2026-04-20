'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cancelRemindersForTask, generateReminderForTask } from '@/lib/tasks/reminder-generator'

// KFZ-175: Server Actions fuer manuelle Tasks.

export async function createManualTask(input: {
  titel: string
  beschreibung?: string
  zugewiesen_an: string
  faellig_am?: string
  prioritaet?: string
  fall_id?: string
  lead_id?: string
}): Promise<{ success?: boolean; error?: string; id?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }
  if (!input.titel.trim()) return { error: 'Titel ist Pflicht' }

  const { data, error } = await supabase.from('tasks').insert({
    titel: input.titel.trim(),
    beschreibung: input.beschreibung?.trim() || null,
    zugewiesen_an: input.zugewiesen_an,
    faellig_am: input.faellig_am || null,
    prioritaet: input.prioritaet || 'normal',
    fall_id: input.fall_id || null,
    lead_id: input.lead_id || null,
    typ: 'action',
    task_typ: 'manuell',
    auto_erstellt: false,
    erstellt_von_id: user.id,
    status: 'offen',
  }).select('id').single()

  if (error) return { error: error.message }

  if (input.fall_id) revalidatePath(`/faelle/${input.fall_id}`)
  if (input.lead_id) revalidatePath(`/dispatch/leads/${input.lead_id}`)

  // AAR-430: Reminder-Kaskade für manuell erstellten Task mit Deadline
  if (data?.id && input.faellig_am) {
    try {
      await generateReminderForTask(data.id)
    } catch (err) {
      console.error('[AAR-430] generateReminderForTask (manual) fehlgeschlagen:', err)
    }
  }

  return { success: true, id: data?.id }
}

export async function updateManualTaskStatus(
  taskId: string,
  status: 'offen' | 'in-bearbeitung' | 'erledigt' | 'blockiert',
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'erledigt') update.erledigt_am = new Date().toISOString()

  const { error } = await supabase.from('tasks').update(update).eq('id', taskId)
  if (error) return { error: error.message }

  // AAR-430: Reminder canceln bei Abschluss/Block, regenerieren bei Wieder-Öffnen
  try {
    if (['erledigt', 'blockiert'].includes(status)) {
      await cancelRemindersForTask(taskId)
    } else if (status === 'offen' || status === 'in-bearbeitung') {
      await cancelRemindersForTask(taskId)
      await generateReminderForTask(taskId)
    }
  } catch (err) {
    console.error('[AAR-430] updateManualTaskStatus Reminder-Hook fehlgeschlagen:', err)
  }
  return { success: true }
}

export async function listMyTasks(tab: 'assigned' | 'created' | 'all' = 'assigned'): Promise<{
  id: string; titel: string; beschreibung: string | null; status: string; prioritaet: string | null
  faellig_am: string | null; fall_id: string | null; lead_id: string | null
  zugewiesen_an: string | null; erstellt_von_id: string | null; auto_erstellt: boolean
  created_at: string; fall_nummer?: string | null
}[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return []

  let query = supabase
    .from('tasks')
    .select('id, titel, beschreibung, status, prioritaet, faellig_am, fall_id, lead_id, zugewiesen_an, erstellt_von_id, auto_erstellt, created_at')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (tab === 'assigned') {
    query = query.eq('zugewiesen_an', user.id).neq('status', 'erledigt')
  } else if (tab === 'created') {
    query = query.eq('erstellt_von_id', user.id)
  }
  // 'all' = no filter (admin only, enforced by RLS)

  const { data } = await query
  return (data ?? []) as typeof data & { fall_nummer?: string | null }[]
}

export async function countMyOpenTasks(): Promise<number> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return 0

  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('zugewiesen_an', user.id)
    .neq('status', 'erledigt')

  return count ?? 0
}
