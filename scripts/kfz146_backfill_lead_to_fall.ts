/**
 * KFZ-146 v2: Backfill — Alle bereits konvertierten Leads: Side-Channel-Daten an Fall zuordnen.
 * Erweitert um nachrichten + fall_dokumente.
 * Ausfuehren: npx tsx scripts/kfz146_backfill_lead_to_fall.ts [--apply]
 */

import { createAdminClient } from '../src/lib/supabase/admin'

const dryRun = !process.argv.includes('--apply')

async function backfill() {
  const db = createAdminClient()

  // Alle konvertierten Leads (die eine fall_id haben)
  const { data: faelle } = await db.from('faelle')
    .select('id, lead_id, fall_nummer')
    .not('lead_id', 'is', null)

  if (!faelle?.length) { console.log('Keine konvertierten Leads gefunden.'); return }
  console.log(`${faelle.length} Fälle mit Lead-Referenz gefunden.`)
  if (dryRun) console.log('DRY-RUN Modus. Verwende --apply zum Ausführen.\n')

  let totalCalls = 0, totalTasks = 0, totalEmails = 0, totalTermine = 0, totalNachrichten = 0, totalDokumente = 0

  for (const fall of faelle) {
    if (dryRun) {
      // Zähle was betroffen wäre
      const { count: calls } = await db.from('calls').select('id', { count: 'exact', head: true }).eq('lead_id', fall.lead_id).is('fall_id', null)
      const { count: tasks } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('lead_id', fall.lead_id).is('fall_id', null)
      const { count: nachrichten } = await db.from('nachrichten').select('id', { count: 'exact', head: true }).eq('lead_id', fall.lead_id).is('fall_id', null)
      const { count: dokumente } = await db.from('fall_dokumente').select('id', { count: 'exact', head: true }).eq('fall_id', fall.id).is('lead_id', null)
      const total = (calls ?? 0) + (tasks ?? 0) + (nachrichten ?? 0) + (dokumente ?? 0)
      if (total > 0) {
        console.log(`  ${fall.fall_nummer ?? fall.id.slice(0, 8)}: ${calls ?? 0} Calls, ${tasks ?? 0} Tasks, ${nachrichten ?? 0} Nachrichten, ${dokumente ?? 0} Dokumente`)
      }
      totalCalls += calls ?? 0
      totalTasks += tasks ?? 0
      totalNachrichten += nachrichten ?? 0
      totalDokumente += dokumente ?? 0
    } else {
      const { data: result } = await db.rpc('link_lead_data_to_fall', { p_lead_id: fall.lead_id, p_fall_id: fall.id })
      const r = result as Record<string, number> | null
      if (r && (r.calls > 0 || r.tasks > 0 || r.emails > 0 || r.termine > 0 || r.nachrichten > 0 || r.dokumente > 0)) {
        console.log(`  [OK] ${fall.fall_nummer ?? fall.id.slice(0, 8)}: Calls=${r.calls}, Tasks=${r.tasks}, Emails=${r.emails}, Termine=${r.termine}, Nachrichten=${r.nachrichten}, Dokumente=${r.dokumente}`)
      }
      totalCalls += r?.calls ?? 0
      totalTasks += r?.tasks ?? 0
      totalEmails += r?.emails ?? 0
      totalTermine += r?.termine ?? 0
      totalNachrichten += r?.nachrichten ?? 0
      totalDokumente += r?.dokumente ?? 0
    }
  }

  console.log(`\n${dryRun ? 'DRY-RUN' : 'FERTIG'}: ${totalCalls} Calls, ${totalTasks} Tasks, ${totalEmails} Emails, ${totalTermine} Termine, ${totalNachrichten} Nachrichten, ${totalDokumente} Dokumente`)
}

backfill()
