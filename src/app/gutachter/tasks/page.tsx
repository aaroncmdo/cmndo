import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardListIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
} from 'lucide-react'

const PRIO_COLORS: Record<string, string> = {
  kritisch: 'bg-red-50 text-red-300 border-red-800',
  dringend: 'bg-amber-50 text-amber-300 border-amber-800',
  normal: 'bg-gray-100 text-gray-700 border-gray-300',
}

const PRIO_LABELS: Record<string, string> = {
  kritisch: 'Kritisch',
  dringend: 'Dringend',
  normal: 'Normal',
}

export default async function GutachterTasksPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const now = new Date()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, fall_id, typ, titel, beschreibung, status, faellig_am, prioritaet, created_at')
    .eq('zugewiesen_an', user.id)
    .in('status', ['offen', 'in-bearbeitung'])
    .order('faellig_am', { ascending: true, nullsFirst: false })

  // Resolve fall numbers
  const fallIds = [...new Set((tasks ?? []).map(t => t.fall_id).filter(Boolean))]
  const { data: faelle } = fallIds.length > 0
    ? await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
    : { data: [] }
  const fallMap: Record<string, string> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
  }

  const offeneTasks = (tasks ?? []).filter(t => t.status === 'offen' || t.status === 'in-bearbeitung')
  const ueberfaellige = offeneTasks.filter(t => t.faellig_am && new Date(t.faellig_am) < now)
  const heute = offeneTasks.filter(t => {
    if (!t.faellig_am) return false
    const d = new Date(t.faellig_am)
    return d >= now && d.toDateString() === now.toDateString()
  })

  function formatDeadline(d: string | null) {
    if (!d) return null
    const date = new Date(d)
    const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60))
    if (diff < 0) return { text: `${Math.abs(diff)}h überfällig`, overdue: true }
    if (diff < 24) return { text: `in ${diff}h`, overdue: false }
    const days = Math.floor(diff / 24)
    return { text: `in ${days}d`, overdue: false }
  }

  return (
    <div className="h-full overflow-y-auto py-6 sm:py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardListIcon className="w-6 h-6 text-[var(--brand-accent)]" />
          <h1 className="text-2xl font-semibold text-gray-900">Meine Tasks</h1>
          <span className="ml-auto bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">
            {offeneTasks.length} offen
          </span>
        </div>

        {/* Warnungen */}
        {ueberfaellige.length > 0 && (
          <div className="bg-red-50/50 border border-red-800/50 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">
              {ueberfaellige.length} {ueberfaellige.length === 1 ? 'Task ist' : 'Tasks sind'} ueberfaellig!
            </p>
          </div>
        )}

        {/* Tasks */}
        {offeneTasks.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <CheckCircle2Icon className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Keine offenen Tasks. Alles erledigt!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {offeneTasks.map(task => {
              const dl = formatDeadline(task.faellig_am)
              const prio = task.prioritaet ?? 'normal'
              return (
                <div
                  key={task.id}
                  className={`bg-white border rounded-2xl p-4 ${
                    dl?.overdue ? 'border-red-800/60' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-gray-900 text-sm font-medium">{task.titel}</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIO_COLORS[prio]}`}>
                          {PRIO_LABELS[prio]}
                        </span>
                      </div>
                      {task.beschreibung && (
                        <p className="text-gray-500 text-xs mt-1 line-clamp-2">{task.beschreibung}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        {task.fall_id && fallMap[task.fall_id] && (
                          <Link
                            href={`/gutachter/fall/${task.fall_id}`}
                            className="text-[var(--brand-accent)] hover:text-[var(--brand-accent)] flex items-center gap-1"
                          >
                            #{fallMap[task.fall_id]}
                            <ExternalLinkIcon className="w-3 h-3" />
                          </Link>
                        )}
                        {dl && (
                          <span className={`flex items-center gap-1 ${dl.overdue ? 'text-red-400' : 'text-gray-500'}`}>
                            <ClockIcon className="w-3 h-3" />
                            {dl.text}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
