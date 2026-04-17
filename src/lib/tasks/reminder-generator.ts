// AAR-430: Generator/Canceller/Regenerator für task_reminders.
import { createAdminClient } from '@/lib/supabase/admin'
import { REMINDER_KASKADEN } from './reminder-config'

export async function generateReminderForTask(taskId: string): Promise<void> {
  const db = createAdminClient()
  const { data: task } = await db
    .from('tasks')
    .select('id, faellig_am, prioritaet, empfaenger_rolle, status')
    .eq('id', taskId)
    .maybeSingle()
  if (!task?.faellig_am) return
  if (['erledigt', 'canceled', 'blockiert'].includes(task.status as string)) return

  const prio = (task.prioritaet ?? 'normal') as 'normal' | 'dringend' | 'kritisch'
  const kaskade = REMINDER_KASKADEN[prio] ?? REMINDER_KASKADEN.normal
  const deadline = new Date(task.faellig_am as string).getTime()

  for (const r of kaskade) {
    const geplant = new Date(deadline + r.offset).toISOString()
    const { error } = await db.from('task_reminders').upsert({
      task_id: taskId,
      reminder_typ: r.typ,
      geplant_fuer: geplant,
      empfaenger_rolle: task.empfaenger_rolle,
      kanal: r.kanal,
      status: 'pending',
      versuche: 0,
    }, { onConflict: 'task_id,reminder_typ' })
    if (error) {
      console.error(`[AAR-430] Upsert task_reminder ${r.typ} für Task ${taskId} fehlgeschlagen: ${error.message}`)
    }
  }
}

export async function cancelRemindersForTask(taskId: string): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('task_reminders')
    .update({ status: 'cancelled' })
    .eq('task_id', taskId)
    .eq('status', 'pending')
  if (error) {
    console.error(`[AAR-430] Cancel task_reminders für Task ${taskId} fehlgeschlagen: ${error.message}`)
  }
}

export async function regenerateRemindersForTask(taskId: string): Promise<void> {
  await cancelRemindersForTask(taskId)
  await generateReminderForTask(taskId)
}
