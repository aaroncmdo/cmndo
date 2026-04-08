/**
 * KFZ-136: Backfill-Script fuer Bestandstermine.
 * Generiert Reminder fuer alle Termine mit Status 'reserviert' oder 'bestaetigt'
 * und start_zeit in der Zukunft.
 *
 * Ausfuehren: npx tsx scripts/kfz136_backfill_reminders.ts
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { generateReminderForTermin } from '../src/lib/reminders/generate'

async function backfill() {
  const supabase = createAdminClient()

  const { data: termine, error } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, status')
    .in('status', ['reserviert', 'bestaetigt'])
    .gte('start_zeit', new Date().toISOString())
    .order('start_zeit')

  if (error) {
    console.error('Fehler beim Laden der Termine:', error.message)
    process.exit(1)
  }

  console.log(`${termine?.length ?? 0} aktive Termine gefunden.`)

  let success = 0
  let failed = 0

  for (const termin of termine ?? []) {
    try {
      await generateReminderForTermin(termin.id)
      success++
      console.log(`  [OK] ${termin.id} (${termin.status}, ${termin.start_zeit})`)
    } catch (err) {
      failed++
      console.error(`  [FAIL] ${termin.id}:`, err)
    }
  }

  console.log(`\nFertig: ${success} OK, ${failed} fehlgeschlagen.`)
}

backfill()
