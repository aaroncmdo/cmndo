// P4b (Aufgaben-Hub-Konsolidierung): kanonische Meine-Tasks-Impl. War vorher ein
// Re-Export von /admin/meine-tasks — diese Standalone-Route ist jetzt ein 308-
// Redirect hierher (next.config), ihre page.tsx wurde hierher gemoved.
// MyTasksClient bleibt unter admin/meine-tasks/ (auch von mitarbeiter/tasks genutzt).
import { createClient } from '@/lib/supabase/server'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import { redirect } from 'next/navigation'
import { listMyTasks } from '@/lib/tasks/manual-actions'
import { isExecutorEnabled } from '@/lib/task-executor/policy'
import MyTasksClient from '@/app/admin/meine-tasks/MyTasksClient'

// KFZ-175: Meine-Tasks Page fuer Admin + Kundenbetreuer.

export const dynamic = 'force-dynamic'

export default async function MeineTasksPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!profile || !['admin', 'kundenbetreuer', 'dispatch'].includes(profile.rolle)) redirect('/login')

  const executorEnabled = isExecutorEnabled()
  const assigned = await listMyTasks('assigned')
  const created = await listMyTasks('created')

  // Fall-Nummern nachladen
  const fallIds = [...new Set([...assigned, ...created].map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap = new Map<string, string>()
  if (fallIds.length) {
    // CMM-49: faelle-frei via Bridge+claims (shared helper).
    for (const r of await claimNummernForFaelle(supabase, fallIds)) {
      fallMap.set(r.fall_id, r.claim_nummer ?? r.fall_id.slice(0, 8))
    }
  }

  const enrich = (tasks: typeof assigned) => tasks.map(t => ({
    ...t,
    claim_nummer: t.fall_id ? fallMap.get(t.fall_id) ?? null : null,
  }))

  return <MyTasksClient assigned={enrich(assigned)} created={enrich(created)} isAdmin={profile.rolle === 'admin'} executorEnabled={executorEnabled} />
}
