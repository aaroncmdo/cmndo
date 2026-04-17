import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTaskReminder } from '@/lib/tasks/reminder-sender'

/**
 * AAR-430: Cron-Route Task-Erinnerungen.
 * Liest fällige Einträge aus task_reminders (status='pending' AND geplant_fuer <= NOW())
 * und delegiert an sendTaskReminder(). Ersetzt die alte Logik auf Basis von
 * tasks.erinnerung_gesendet.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  const { data: pending, error } = await supabase
    .from('task_reminders')
    .select('id')
    .eq('status', 'pending')
    .lte('geplant_fuer', now.toISOString())
    .limit(500)

  if (error) {
    console.error('[AAR-430] Query task_reminders fehlgeschlagen:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0
  const processed = pending?.length ?? 0

  for (const row of pending ?? []) {
    try {
      await sendTaskReminder(row.id)
      // Ergebnis prüfen
      const { data: after } = await supabase
        .from('task_reminders')
        .select('status')
        .eq('id', row.id)
        .maybeSingle()
      if (after?.status === 'sent') sent++
      else if (after?.status === 'failed') failed++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[AAR-430] sendTaskReminder(${row.id}) fehlgeschlagen:`, msg)
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    failed,
    checked_at: now.toISOString(),
  })
}
