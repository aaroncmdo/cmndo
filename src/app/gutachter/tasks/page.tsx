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
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

const PRIO_COLORS: Record<string, string> = {
  kritisch: 'bg-red-50 text-red-300 border-red-800',
  dringend: 'bg-amber-50 text-amber-300 border-amber-800',
  normal: 'bg-[#f8f9fb] text-claimondo-navy border-claimondo-border',
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
        <PageHeader
          title="Meine Tasks"
          icon={ClipboardListIcon}
          actions={
            <span className="bg-[#f8f9fb] text-claimondo-navy text-xs font-medium px-2.5 py-1 rounded-full">
              {offeneTasks.length} offen
            </span>
          }
        />

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
          <EmptyState
            icon={CheckCircle2Icon}
            title="Alle Tasks erledigt 🎉"
            description="Sehr gut. Neue Tasks erscheinen automatisch nach Termin-Abschlüssen oder Doku-Anforderungen."
            actions={[
              { label: 'Heute öffnen', href: '/gutachter/heute' },
            ]}
          />
        ) : (
          <div className="space-y-2">
            {offeneTasks.map(task => {
              const dl = formatDeadline(task.faellig_am)
              const prio = task.prioritaet ?? 'normal'
              return (
                <div
                  key={task.id}
                  className={`bg-white border rounded-2xl p-4 ${
                    dl?.overdue ? 'border-red-800/60' : 'border-claimondo-border'
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
                          <span className={`flex items-center gap-1 ${dl.overdue ? 'text-red-400' : 'text-claimondo-ondo'}`}>
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
