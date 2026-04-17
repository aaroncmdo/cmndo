// AAR-430: Einmaliger Backfill für alle offenen Tasks mit zukünftiger Deadline.
// Aufruf: npx tsx scripts/aar430-backfill-reminders.ts
import { createAdminClient } from '../src/lib/supabase/admin'
import { generateReminderForTask } from '../src/lib/tasks/reminder-generator'

async function main() {
  const db = createAdminClient()
  const { data: tasks, error } = await db.from('tasks')
    .select('id')
    .in('status', ['offen', 'in-bearbeitung', 'blockiert'])
    .not('faellig_am', 'is', null)
    .gt('faellig_am', new Date().toISOString())

  if (error) {
    console.error('[AAR-430] Backfill-Query fehlgeschlagen:', error.message)
    process.exit(1)
  }

  console.log(`[AAR-430] Backfill: ${tasks?.length ?? 0} Tasks`)
  let done = 0
  for (const t of tasks ?? []) {
    await generateReminderForTask(t.id)
    done++
    if (done % 20 === 0) console.log(`  ... ${done}/${tasks?.length ?? 0}`)
  }
  console.log(`[AAR-430] Done. ${done} Tasks verarbeitet.`)
}

main().catch(e => { console.error(e); process.exit(1) })
