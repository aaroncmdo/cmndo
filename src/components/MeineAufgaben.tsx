'use client'

import Link from 'next/link'
import { CheckCircle2Icon, ClockIcon, AlertTriangleIcon } from 'lucide-react'

type Task = {
  id: string
  fall_id: string
  titel: string
  beschreibung: string | null
  status: string
  prioritaet: string | null
  faellig_am: string | null
  created_at: string | null
  fall_nummer?: string | null
  kunde_name?: string | null
}

function isOverdue(t: Task): boolean {
  if (!t.faellig_am || t.status === 'erledigt') return false
  return new Date(t.faellig_am) < new Date()
}

function isToday(t: Task): boolean {
  if (!t.faellig_am) return false
  const d = new Date(t.faellig_am)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function fmtDeadline(d: string | null): string {
  if (!d) return '\u2014'
  const dt = new Date(d)
  const now = new Date()
  const diff = dt.getTime() - now.getTime()
  const hours = Math.round(diff / 3600000)
  if (hours < 0) return `${Math.abs(hours)}h ueberfaellig`
  if (hours < 1) return `${Math.round(diff / 60000)}min`
  if (hours < 24) return `${hours}h`
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function MeineAufgaben({
  tasks,
  title = 'Meine offenen Aufgaben',
  fallLinkPrefix = '/admin/faelle/',
  showKunde = true,
}: {
  tasks: Task[]
  title?: string
  fallLinkPrefix?: string
  showKunde?: boolean
}) {
  const offene = tasks.filter(t => t.status !== 'erledigt')
  const ueberfaellig = offene.filter(isOverdue)
  const heute = offene.filter(t => !isOverdue(t) && isToday(t))
  const rest = offene.filter(t => !isOverdue(t) && !isToday(t))

  if (offene.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-medium text-gray-500 mb-3">{title}</h2>
        <p className="text-gray-400 text-sm">Keine offenen Aufgaben</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        <span className="text-xs text-gray-500">{offene.length} offen</span>
      </div>

      {/* Ueberfaellig */}
      {ueberfaellig.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1.5">Ueberfaellig ({ueberfaellig.length})</p>
          <div className="space-y-1.5">
            {ueberfaellig.map(t => <TaskRow key={t.id} task={t} fallLinkPrefix={fallLinkPrefix} showKunde={showKunde} variant="overdue" />)}
          </div>
        </div>
      )}

      {/* Heute */}
      {heute.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1.5">Heute ({heute.length})</p>
          <div className="space-y-1.5">
            {heute.map(t => <TaskRow key={t.id} task={t} fallLinkPrefix={fallLinkPrefix} showKunde={showKunde} variant="today" />)}
          </div>
        </div>
      )}

      {/* Rest */}
      {rest.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Spaeter ({rest.length})</p>
          <div className="space-y-1.5">
            {rest.map(t => <TaskRow key={t.id} task={t} fallLinkPrefix={fallLinkPrefix} showKunde={showKunde} variant="normal" />)}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, fallLinkPrefix, showKunde, variant }: {
  task: Task; fallLinkPrefix: string; showKunde: boolean; variant: 'overdue' | 'today' | 'normal'
}) {
  const borderColor = variant === 'overdue' ? 'border-red-800/50' : variant === 'today' ? 'border-amber-800/50' : 'border-gray-200'
  const Icon = variant === 'overdue' ? AlertTriangleIcon : variant === 'today' ? ClockIcon : CheckCircle2Icon
  const iconColor = variant === 'overdue' ? 'text-red-400' : variant === 'today' ? 'text-amber-400' : 'text-gray-500'
  const prioColors: Record<string, string> = {
    kritisch: 'bg-red-50 text-red-400',
    dringend: 'bg-amber-50 text-amber-400',
    hoch: 'bg-amber-50 text-amber-400',
  }

  return (
    <Link href={`${fallLinkPrefix}${task.fall_id}`}
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${borderColor} bg-gray-100/30 hover:bg-gray-100/60 transition-colors`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug">{task.titel}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
          {showKunde && task.kunde_name && <span className="text-gray-500">{task.kunde_name}</span>}
          {task.fall_nummer && <span className="text-blue-400 font-mono">{task.fall_nummer}</span>}
          <span className={variant === 'overdue' ? 'text-red-400 font-semibold' : 'text-gray-500'}>{fmtDeadline(task.faellig_am)}</span>
          {task.prioritaet && prioColors[task.prioritaet] && (
            <span className={`px-1.5 py-0 rounded ${prioColors[task.prioritaet]}`}>{task.prioritaet}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
