import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangleIcon } from 'lucide-react'

type OverdueTask = {
  id: string
  titel: string
  faellig_am: string
  prioritaet: string | null
  fall_id: string | null
  fall_nummer: string | null
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

  // Resolve fall_nummern
  const fallIds = [...new Set(tasks.map(t => t.fall_id).filter(Boolean))] as string[]
  const { data: faelle } = fallIds.length > 0
    ? await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
    : { data: [] }
  const fallMap: Record<string, string> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
  }

  const items: OverdueTask[] = tasks.map(t => ({
    id: t.id,
    titel: t.titel,
    faellig_am: t.faellig_am!,
    prioritaet: t.prioritaet,
    fall_id: t.fall_id,
    fall_nummer: t.fall_id ? fallMap[t.fall_id] ?? null : null,
  }))

  return (
    <div className="bg-red-50/50 border border-red-800/50 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangleIcon className="w-4 h-4 text-red-400" />
        <h3 className="text-sm font-semibold text-red-300">
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
              className="flex items-center gap-3 bg-red-50/40 rounded-xl px-3 py-2.5"
            >
              {task.prioritaet === 'kritisch' && (
                <span className="shrink-0 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">!</span>
              )}
              {task.prioritaet === 'dringend' && (
                <span className="shrink-0 bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">!!</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-red-200 text-sm truncate">{task.titel}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-red-400/70">
                  <span>
                    {overdueDays === 0
                      ? 'Heute fällig'
                      : `${overdueDays} ${overdueDays === 1 ? 'Tag' : 'Tage'} überfällig`}
                  </span>
                  {task.fall_nummer && (
                    <>
                      <span className="text-red-800">·</span>
                      <Link
                        href={`/admin/faelle/${task.fall_id}`}
                        className="text-red-400 hover:text-red-300"
                      >
                        {task.fall_nummer}
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
