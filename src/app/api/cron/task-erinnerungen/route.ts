import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Cron-Route: Task-Erinnerungen (stuendlich)
 * Prueft alle Tasks wo deadline in den naechsten 2h liegt
 * und erinnerung_gesendet = false. Sendet Erinnerung.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
  let sent = 0

  // Find tasks with deadline in next 2h that haven't been reminded
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, fall_id, titel, beschreibung, zugewiesen_an, faellig_am, prioritaet')
    .in('status', ['offen', 'in-bearbeitung'])
    .eq('erinnerung_gesendet', false)
    .not('faellig_am', 'is', null)
    .lte('faellig_am', in2h)
    .gte('faellig_am', now.toISOString())

  for (const task of tasks ?? []) {
    if (!task.zugewiesen_an) continue

    // Get assignee profile for notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('vorname, nachname, email, rolle')
      .eq('id', task.zugewiesen_an)
      .single()

    if (!profile) continue

    const name = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Nutzer'
    const prioLabel = task.prioritaet === 'kritisch' ? ' [KRITISCH]' : task.prioritaet === 'dringend' ? ' [DRINGEND]' : ''

    // Create notification message
    if (task.fall_id) {
      await supabase.from('nachrichten').insert({
        fall_id: task.fall_id,
        kanal: 'system',
        sender_id: null,
        sender_rolle: 'system',
        nachricht: `Erinnerung${prioLabel}: "${task.titel}" ist in Kuerze faellig. Bitte zeitnah erledigen.`,
        hat_anhang: false,
      })
    }

    // Mark as reminded
    await supabase
      .from('tasks')
      .update({ erinnerung_gesendet: true })
      .eq('id', task.id)

    sent++
  }

  // Also check for overdue tasks and mark them
  const { data: overdue } = await supabase
    .from('tasks')
    .select('id, fall_id, titel, zugewiesen_an')
    .in('status', ['offen', 'in-bearbeitung'])
    .not('faellig_am', 'is', null)
    .lt('faellig_am', now.toISOString())

  const overdueCount = overdue?.length ?? 0

  return NextResponse.json({
    ok: true,
    reminders_sent: sent,
    overdue_tasks: overdueCount,
    checked_at: now.toISOString(),
  })
}
