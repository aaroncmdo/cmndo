import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listMyTasks } from '@/lib/tasks/manual-actions'
import MyTasksClient from './MyTasksClient'

// KFZ-175: Meine-Tasks Page fuer Admin + Kundenbetreuer.

export const dynamic = 'force-dynamic'

export default async function MeineTasksPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!profile || !['admin', 'kundenbetreuer', 'dispatch'].includes(profile.rolle)) redirect('/login')

  const assigned = await listMyTasks('assigned')
  const created = await listMyTasks('created')

  // Fall-Nummern nachladen
  const fallIds = [...new Set([...assigned, ...created].map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap = new Map<string, string>()
  if (fallIds.length) {
    const { data: faelle } = await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
    for (const f of faelle ?? []) fallMap.set(f.id as string, (f.fall_nummer as string) ?? f.id.slice(0, 8))
  }

  const enrich = (tasks: typeof assigned) => tasks.map(t => ({
    ...t,
    fall_nummer: t.fall_id ? fallMap.get(t.fall_id) ?? null : null,
  }))

  return <MyTasksClient assigned={enrich(assigned)} created={enrich(created)} isAdmin={profile.rolle === 'admin'} />
}
