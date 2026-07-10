import { createClient } from '@/lib/supabase/server'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ClockIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
} from 'lucide-react'
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'

const PRIO_COLORS: Record<string, string> = {
  kritisch: 'bg-danger-soft text-danger-strong border-danger/30',
  dringend: 'bg-warning-soft text-warning-strong border-warning/30',
  normal: 'bg-claimondo-bg text-claimondo-navy border-claimondo-border',
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
  // CMM-49: faelle-frei via Bridge+claims (shared helper).
  const fallIds = [...new Set((tasks ?? []).map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap: Record<string, string> = {}
  for (const r of await claimNummernForFaelle(supabase, fallIds)) {
    fallMap[r.fall_id] = r.claim_nummer ?? r.fall_id.slice(0, 8)
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
        <SvPageChrome title="Meine Tasks" />

        {/* Warnungen */}
        {ueberfaellige.length > 0 && (
          <div className="bg-danger-soft/50 border border-danger/30 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-danger shrink-0" />
            <p className="text-danger-strong text-sm">
              {ueberfaellige.length} {ueberfaellige.length === 1 ? 'Task ist' : 'Tasks sind'} ueberfaellig!
            </p>
          </div>
        )}

        {/* Tasks */}
        {offeneTasks.length === 0 ? (
          <div className="bg-white border border-claimondo-border rounded-2xl p-12 text-center">
            <CheckCircle2Icon className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="text-claimondo-ondo text-sm">Keine offenen Tasks. Alles erledigt!</p>
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
                    dl?.overdue ? 'border-danger/30' : 'border-claimondo-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-claimondo-navy text-sm font-medium">{task.titel}</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIO_COLORS[prio]}`}>
                          {PRIO_LABELS[prio]}
                        </span>
                      </div>
                      {task.beschreibung && (
                        <p className="text-claimondo-ondo text-xs mt-1 line-clamp-2">{task.beschreibung}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-claimondo-ondo">
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
                          <span className={`flex items-center gap-1 ${dl.overdue ? 'text-danger' : 'text-claimondo-ondo'}`}>
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
