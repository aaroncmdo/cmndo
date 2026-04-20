'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircleIcon, CircleDotIcon, ClockIcon, AlertTriangleIcon, ExternalLinkIcon } from 'lucide-react'
import { updateManualTaskStatus } from '@/lib/tasks/manual-actions'

// KFZ-175: Meine-Tasks Client — Tabs Zugewiesen/Erstellt.

type TaskRow = {
  id: string; titel: string; beschreibung: string | null; status: string
  prioritaet: string | null; faellig_am: string | null; fall_id: string | null
  lead_id: string | null; auto_erstellt: boolean; created_at: string
  fall_nummer?: string | null
}

const PRIO_BADGE: Record<string, string> = {
  dringend: 'bg-red-50 text-red-700',
  hoch: 'bg-amber-50 text-amber-700',
  normal: 'bg-gray-100 text-gray-600',
  niedrig: 'bg-gray-50 text-gray-400',
}

const STATUS_ICON: Record<string, { Icon: typeof CheckCircleIcon; cls: string }> = {
  offen: { Icon: CircleDotIcon, cls: 'text-amber-500' },
  'in-bearbeitung': { Icon: ClockIcon, cls: 'text-blue-500' },
  erledigt: { Icon: CheckCircleIcon, cls: 'text-emerald-500' },
  blockiert: { Icon: AlertTriangleIcon, cls: 'text-red-500' },
}

export default function MyTasksClient({
  assigned, created, isAdmin,
}: {
  assigned: TaskRow[]; created: TaskRow[]; isAdmin: boolean
}) {
  const [tab, setTab] = useState<'assigned' | 'created'>('assigned')
  const tasks = tab === 'assigned' ? assigned : created
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleStatusChange(taskId: string, status: string) {
    startTransition(async () => {
      await updateManualTaskStatus(taskId, status as 'offen' | 'in-bearbeitung' | 'erledigt')
      router.refresh()
    })
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Meine Tasks</h1>
      <p className="text-sm text-gray-500 mb-6">{assigned.length} offen zugewiesen, {created.length} von dir erstellt</p>

      <div className="inline-flex bg-gray-100 rounded-xl p-0.5 text-xs font-medium mb-4">
        <button onClick={() => setTab('assigned')}
          className={`px-4 py-1.5 rounded-lg transition-colors ${tab === 'assigned' ? 'bg-white text-[#1E3A5F] shadow' : 'text-gray-500'}`}>
          Mir zugewiesen ({assigned.length})
        </button>
        <button onClick={() => setTab('created')}
          className={`px-4 py-1.5 rounded-lg transition-colors ${tab === 'created' ? 'bg-white text-[#1E3A5F] shadow' : 'text-gray-500'}`}>
          Von mir erstellt ({created.length})
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">Keine Tasks in dieser Ansicht.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="text-left px-4 py-3">Task</th>
                <th className="text-left px-4 py-3">Fall/Lead</th>
                <th className="text-left px-4 py-3">Priorität</th>
                <th className="text-left px-4 py-3">Fällig</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map(t => {
                const cfg = STATUS_ICON[t.status] ?? STATUS_ICON.offen
                const isOverdue = t.faellig_am && new Date(t.faellig_am) < new Date() && t.status !== 'erledigt'
                return (
                  <tr key={t.id} className={`hover:bg-gray-50/50 ${isOverdue ? 'bg-red-50/20' : ''}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => handleStatusChange(t.id, t.status === 'erledigt' ? 'offen' : 'erledigt')} disabled={pending}>
                        <cfg.Icon className={`w-4 h-4 ${cfg.cls}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-gray-900 ${t.status === 'erledigt' ? 'line-through opacity-50' : ''}`}>{t.titel}</p>
                      {t.auto_erstellt && <span className="text-[9px] text-gray-400">auto</span>}
                    </td>
                    <td className="px-4 py-3">
                      {t.fall_id && t.fall_nummer && (
                        <Link href={`/faelle/${t.fall_id}`} target="_blank" rel="noopener" className="text-[#4573A2] hover:underline text-xs flex items-center gap-1">
                          {t.fall_nummer} <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIO_BADGE[t.prioritaet ?? 'normal']}`}>
                        {t.prioritaet ?? 'normal'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select value={t.status} onChange={e => handleStatusChange(t.id, e.target.value)} disabled={pending}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                        <option value="offen">Offen</option>
                        <option value="in-bearbeitung">In Bearbeitung</option>
                        <option value="erledigt">Erledigt</option>
                        <option value="blockiert">Blockiert</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
