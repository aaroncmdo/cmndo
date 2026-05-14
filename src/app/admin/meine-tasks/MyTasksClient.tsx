'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircleIcon, CircleDotIcon, ClockIcon, AlertTriangleIcon, ExternalLinkIcon, ClipboardListIcon } from 'lucide-react'
import { updateManualTaskStatus } from '@/lib/tasks/manual-actions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

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
  normal: 'bg-claimondo-bg text-claimondo-ondo',
  niedrig: 'bg-claimondo-bg text-claimondo-ondo/70',
}

const STATUS_ICON: Record<string, { Icon: typeof CheckCircleIcon; cls: string }> = {
  offen: { Icon: CircleDotIcon, cls: 'text-amber-500' },
  'in-bearbeitung': { Icon: ClockIcon, cls: 'text-claimondo-ondo' },
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
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Meine Tasks"
        description={`${assigned.length} offen zugewiesen, ${created.length} von dir erstellt`}
        icon={ClipboardListIcon}
      />

      <div className="inline-flex bg-claimondo-bg rounded-ios-xl p-0.5 text-xs font-medium">
        <button onClick={() => setTab('assigned')}
          className={`px-4 py-1.5 rounded-ios-lg transition-colors ${tab === 'assigned' ? 'bg-white text-claimondo-shield shadow' : 'text-claimondo-ondo'}`}>
          Mir zugewiesen ({assigned.length})
        </button>
        <button onClick={() => setTab('created')}
          className={`px-4 py-1.5 rounded-ios-lg transition-colors ${tab === 'created' ? 'bg-white text-claimondo-shield shadow' : 'text-claimondo-ondo'}`}>
          Von mir erstellt ({created.length})
        </button>
      </div>

      <div className="glass-light border border-claimondo-border rounded-ios-md overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-12 text-center text-sm text-claimondo-ondo/70">Keine Tasks in dieser Ansicht.</div>
        ) : (
          <Table>
            <Thead className="text-[10px]! tracking-wide!">
              <Tr>
                <Th className="w-10"></Th>
                <Th className="text-left">Task</Th>
                <Th className="text-left">Fall/Lead</Th>
                <Th className="text-left">Priorität</Th>
                <Th className="text-left">Fällig</Th>
                <Th className="text-left">Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {tasks.map(t => {
                const cfg = STATUS_ICON[t.status] ?? STATUS_ICON.offen
                const isOverdue = t.faellig_am && new Date(t.faellig_am) < new Date() && t.status !== 'erledigt'
                return (
                  <Tr key={t.id} className={`hover:bg-claimondo-bg/50 ${isOverdue ? 'bg-red-50/20' : ''}`}>
                    <Td>
                      <button onClick={() => handleStatusChange(t.id, t.status === 'erledigt' ? 'offen' : 'erledigt')} disabled={pending}>
                        <cfg.Icon className={`w-4 h-4 ${cfg.cls}`} />
                      </button>
                    </Td>
                    <Td>
                      <p className={`text-claimondo-navy ${t.status === 'erledigt' ? 'line-through opacity-50' : ''}`}>{t.titel}</p>
                      {t.auto_erstellt && <span className="text-[9px] text-claimondo-ondo/70">auto</span>}
                    </Td>
                    <Td>
                      {t.fall_id && t.fall_nummer && (
                        <Link href={`/faelle/${t.fall_id}`} className="text-claimondo-ondo hover:underline text-xs flex items-center gap-1">
                          {t.fall_nummer} <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge colorCls={PRIO_BADGE[t.prioritaet ?? 'normal']}>
                        {t.prioritaet ?? 'normal'}
                      </StatusBadge>
                    </Td>
                    <Td>
                      <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-claimondo-ondo'}`}>
                        {t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
                      </span>
                    </Td>
                    <Td>
                      <select value={t.status} onChange={e => handleStatusChange(t.id, e.target.value)} disabled={pending}
                        className="text-xs bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-2 py-1 focus:outline-none">
                        <option value="offen">Offen</option>
                        <option value="in-bearbeitung">In Bearbeitung</option>
                        <option value="erledigt">Erledigt</option>
                        <option value="blockiert">Blockiert</option>
                      </select>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
