import { createClient } from '@/lib/supabase/server'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import Link from 'next/link'
import { AlertTriangleIcon } from 'lucide-react'

type OverdueTask = {
  id: string
  titel: string
  faellig_am: string
  prioritaet: string | null
  fall_id: string | null
  claim_nummer: string | null
}

export default async function UeberfaelligeTasks({
  mode,
}: {
  mode: 'admin' | 'user'
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null

  const now = new Date().toISOString()

  let query = supabase
    .from('tasks')
    .select('id, titel, faellig_am, prioritaet, fall_id')
    .not('status', 'eq', 'erledigt')
    .not('faellig_am', 'is', null)
    .lt('faellig_am', now)
    .order('faellig_am', { ascending: true })
    .limit(10)

  // Non-admin: only own tasks
  if (mode === 'user') {
    query = query.eq('zugewiesen_an', user.id)
  }

  const { data: tasks } = await query
  if (!tasks || tasks.length === 0) return null

  // CMM-49: claim_nummern faelle-frei via Bridge+claims (shared helper).
  const fallIds = [...new Set(tasks.map(t => t.fall_id).filter(Boolean))] as string[]
  const fallMap: Record<string, string> = {}
  for (const r of await claimNummernForFaelle(supabase, fallIds)) {
    fallMap[r.fall_id] = r.claim_nummer ?? r.fall_id.slice(0, 8)
  }

  const items: OverdueTask[] = tasks.map(t => ({
    id: t.id,
    titel: t.titel,
    faellig_am: t.faellig_am!,
    prioritaet: t.prioritaet,
    fall_id: t.fall_id,
    claim_nummer: t.fall_id ? fallMap[t.fall_id] ?? null : null,
  }))

  return (
    <div className="bg-danger-soft/50 border border-danger/30 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangleIcon className="w-4 h-4 text-danger-strong" />
        <h3 className="text-sm font-semibold text-danger-strong">
          Überfällige Tasks ({items.length})
        </h3>
      </div>
      <div className="space-y-2">
        {items.map(task => {
          const overdueDays = Math.floor(
            (Date.now() - new Date(task.faellig_am).getTime()) / 86400000,
          )
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 bg-danger-soft/40 rounded-ios-xl px-3 py-2.5"
            >
              {task.prioritaet === 'kritisch' && (
                <span className="shrink-0 bg-danger text-white text-[9px] font-bold px-1.5 py-0.5 rounded">!</span>
              )}
              {task.prioritaet === 'dringend' && (
                <span className="shrink-0 bg-warning text-white text-[9px] font-bold px-1.5 py-0.5 rounded">!!</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-danger-strong text-sm truncate">{task.titel}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-danger-strong/70">
                  <span>
                    {overdueDays === 0
                      ? 'Heute fällig'
                      : `${overdueDays} ${overdueDays === 1 ? 'Tag' : 'Tage'} überfällig`}
                  </span>
                  {task.claim_nummer && (
                    <>
                      <span className="text-danger-strong">·</span>
                      <Link
                        href={`/faelle/${task.fall_id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-danger-strong hover:text-danger-strong"
                      >
                        {task.claim_nummer}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
