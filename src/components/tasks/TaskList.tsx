'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, CheckCircleIcon, CircleDotIcon, ClockIcon, AlertTriangleIcon } from 'lucide-react'
import { updateManualTaskStatus } from '@/lib/tasks/manual-actions'
import TaskCreateModal from './TaskCreateModal'

// KFZ-175: TaskList — zeigt Tasks fuer einen Fall oder Lead in der Sidebar.

type TaskRow = {
  id: string
  titel: string
  status: string
  prioritaet: string | null
  faellig_am: string | null
  auto_erstellt: boolean
}

const STATUS_ICON: Record<string, { Icon: typeof CheckCircleIcon; cls: string }> = {
  offen: { Icon: CircleDotIcon, cls: 'text-amber-500' },
  'in-bearbeitung': { Icon: ClockIcon, cls: 'text-blue-500' },
  erledigt: { Icon: CheckCircleIcon, cls: 'text-emerald-500' },
  blockiert: { Icon: AlertTriangleIcon, cls: 'text-red-500' },
}

export default function TaskList({
  tasks,
  fallId,
  leadId,
  mitarbeiter,
}: {
  tasks: TaskRow[]
  fallId?: string
  leadId?: string
  mitarbeiter: { id: string; name: string; rolle: string }[]
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [pending, startTransition] = useTransition()

  const offene = tasks.filter(t => t.status !== 'erledigt')
  const erledigte = tasks.filter(t => t.status === 'erledigt')

  function handleToggle(taskId: string, currentStatus: string) {
    const next = currentStatus === 'erledigt' ? 'offen' : 'erledigt'
    startTransition(async () => {
      await updateManualTaskStatus(taskId, next as 'offen' | 'erledigt')
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Tasks
        </h3>
        <button onClick={() => setShowCreate(true)}
          className="text-[10px] text-[#4573A2] hover:text-[#1E3A5F] flex items-center gap-0.5 font-medium">
          <PlusIcon className="w-3 h-3" /> Neu
        </button>
      </div>

      {offene.length === 0 && erledigte.length === 0 ? (
        <p className="text-xs text-gray-400">Keine Tasks.</p>
      ) : (
        <div className="space-y-1">
          {offene.map(t => {
            const cfg = STATUS_ICON[t.status] ?? STATUS_ICON.offen
            const isOverdue = t.faellig_am && new Date(t.faellig_am) < new Date() && t.status !== 'erledigt'
            return (
              <div key={t.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                <button onClick={() => handleToggle(t.id, t.status)} disabled={pending}
                  className="mt-0.5 flex-shrink-0">
                  <cfg.Icon className={`w-3.5 h-3.5 ${cfg.cls}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-800 leading-snug">{t.titel}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.prioritaet === 'hoch' && <span className="text-[9px] text-amber-600 font-medium">Hoch</span>}
                    {t.prioritaet === 'dringend' && <span className="text-[9px] text-red-600 font-medium">Dringend</span>}
                    {t.faellig_am && (
                      <span className={`text-[9px] ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                    {t.auto_erstellt && <span className="text-[9px] text-gray-300">auto</span>}
                  </div>
                </div>
              </div>
            )
          })}
          {erledigte.length > 0 && (
            <details className="mt-1">
              <summary className="text-[9px] text-gray-400 cursor-pointer">{erledigte.length} erledigt</summary>
              {erledigte.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1 opacity-50">
                  <button onClick={() => handleToggle(t.id, t.status)} disabled={pending} className="flex-shrink-0">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <span className="text-[11px] text-gray-500 line-through">{t.titel}</span>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {showCreate && (
        <TaskCreateModal
          fallId={fallId}
          leadId={leadId}
          mitarbeiter={mitarbeiter}
          onClose={() => setShowCreate(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}
