// AAR-430: Sendet einen einzelnen Task-Reminder über die in `kanal` konfigurierten Channels.
// kanal-Token: "system", "whatsapp", "email" (zusammengesetzt per "+").
import { createAdminClient } from '@/lib/supabase/admin'

type ReminderRow = {
  id: string
  task_id: string
  reminder_typ: string
  geplant_fuer: string
  empfaenger_rolle: string | null
  kanal: string
  status: string
  versuche: number
}

type TaskRow = {
  id: string
  fall_id: string | null
  titel: string | null
  beschreibung: string | null
  status: string | null
  prioritaet: string | null
  faellig_am: string | null
  zugewiesen_an: string | null
  empfaenger_user_id: string | null
  empfaenger_rolle: string | null
}

type ProfileRow = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
}

function prioLabel(prio: string | null | undefined): string {
  if (prio === 'kritisch') return ' [KRITISCH]'
  if (prio === 'dringend') return ' [DRINGEND]'
  return ''
}

function buildMessage(typ: string, task: TaskRow): string {
  const label = prioLabel(task.prioritaet)
  const titel = task.titel ?? 'Task'
  if (typ.startsWith('pre_')) {
    return `Erinnerung${label}: "${titel}" ist in Kürze fällig. Bitte zeitnah erledigen.`
  }
  if (typ.startsWith('overdue_')) {
    return `Überfällig${label}: "${titel}" hat die Deadline überschritten. Bitte sofort bearbeiten.`
  }
  return `Erinnerung${label}: "${titel}".`
}

async function sendSystemMessage(fallId: string | null, message: string): Promise<void> {
  if (!fallId) return
  const db = createAdminClient()
  await db.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'system',
    sender_id: null,
    sender_rolle: 'system',
    nachricht: message,
    hat_anhang: false,
  })
}

async function sendWhatsAppForTask(profile: ProfileRow | null, message: string): Promise<void> {
  if (!profile?.telefon) throw new Error('Keine Telefonnummer für Empfänger')
  const { sendWhatsApp } = await import('@/lib/whatsapp')
  const result = await sendWhatsApp(profile.telefon, message)
  if (!result.success) {
    throw new Error(result.error ?? 'WhatsApp-Send fehlgeschlagen')
  }
}

async function sendEmailForTask(
  profile: ProfileRow | null,
  task: TaskRow,
  message: string,
): Promise<void> {
  if (!profile?.email) throw new Error('Keine Email-Adresse für Empfänger')
  const { sendEmail } = await import('@/lib/email/google/client')
  const subject = `Task-Erinnerung: ${task.titel ?? 'Task'}`
  const html = `<p>${message.replace(/\n/g, '<br/>')}</p>${
    task.beschreibung ? `<p style="color:#555">${task.beschreibung}</p>` : ''
  }`
  await sendEmail({
    to: profile.email,
    subject,
    html,
    template: 'task_reminder_aar430',
    empfaengerTyp: 'admin',
    fallId: task.fall_id ?? null,
  })
}

export async function sendTaskReminder(reminderId: string): Promise<void> {
  const db = createAdminClient()

  const { data: reminder } = await db
    .from('task_reminders')
    .select('id, task_id, reminder_typ, geplant_fuer, empfaenger_rolle, kanal, status, versuche')
    .eq('id', reminderId)
    .maybeSingle<ReminderRow>()
  if (!reminder || reminder.status !== 'pending') return

  const { data: task } = await db
    .from('tasks')
    .select('id, fall_id, titel, beschreibung, status, prioritaet, faellig_am, zugewiesen_an, empfaenger_user_id, empfaenger_rolle')
    .eq('id', reminder.task_id)
    .maybeSingle<TaskRow>()

  // Task erledigt/cancelled/blockiert → Reminder canceln
  if (!task || ['erledigt', 'canceled', 'blockiert'].includes(task.status ?? '')) {
    await db.from('task_reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
    return
  }

  // Empfänger-Profil laden
  const empfaengerId = task.zugewiesen_an ?? task.empfaenger_user_id
  let profile: ProfileRow | null = null
  if (empfaengerId) {
    const { data: p } = await db
      .from('profiles')
      .select('id, vorname, nachname, email, telefon')
      .eq('id', empfaengerId)
      .maybeSingle<ProfileRow>()
    profile = p ?? null
  }

  const message = buildMessage(reminder.reminder_typ, task)
  const channels = reminder.kanal.split('+').map(c => c.trim()).filter(Boolean)

  const errors: string[] = []
  for (const channel of channels) {
    try {
      if (channel === 'system') {
        await sendSystemMessage(task.fall_id, message)
      } else if (channel === 'whatsapp') {
        await sendWhatsAppForTask(profile, message)
      } else if (channel === 'email') {
        await sendEmailForTask(profile, task, message)
      } else {
        errors.push(`Unbekannter Kanal: ${channel}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${channel}: ${msg}`)
    }
  }

  if (errors.length > 0) {
    await db
      .from('task_reminders')
      .update({
        status: 'failed',
        versuche: (reminder.versuche ?? 0) + 1,
        fehler: errors.join(' | '),
      })
      .eq('id', reminder.id)
  } else {
    await db
      .from('task_reminders')
      .update({ status: 'sent', versendet_am: new Date().toISOString() })
      .eq('id', reminder.id)
  }
}
