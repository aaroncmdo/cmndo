'use server'

// AAR-684 Phase 2: Tasks (KFZ-38) — manuelle Task-Erzeugung + Status-Update.
// resolveGates feuert beim Erledigen, damit blockierte Folge-Tasks
// freigeschaltet werden (Gate-Logik aus @/lib/tasking).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
// AAR-713 Phase 2: shared updateTaskStatusCore — vorher dupliziert in
// admin/tasks/actions.ts mit leicht abweichender Logik (kein erledigt_am-
// Reset, kein Gate-Resolve). Zentralisiert in lib/tasks/.
import { updateTaskStatusCore } from '@/lib/tasks/update-status-core'

export async function createFallTask(
  fallId: string,
  data: { titel: string; beschreibung: string | null; faellig_am: string | null; prioritaet: string },
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'manuell',
    titel: data.titel,
    beschreibung: data.beschreibung,
    faellig_am: data.faellig_am,
    prioritaet: data.prioritaet,
    zugewiesen_an: user.id,
    auto_erstellt: false,
  })

  if (error) throw new Error(error.message)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Task erstellt',
    beschreibung: `Manueller Task: ${data.titel}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
}

export async function updateTaskStatus(taskId: string, newStatus: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const result = await updateTaskStatusCore(supabase, taskId, newStatus)
  if (result.fallId) revalidatePath(`/faelle/${result.fallId}`)
}
