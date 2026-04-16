'use client'

// AAR-229 W3 / F-02..F-06: Mitteilungszentrale Panel.
// Ersetzt perspektivisch NotificationBell als zentrale Anlaufstelle für
// alle Rollen. Wird per Glocke geöffnet (Sheet von rechts, 420px).

import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BellIcon,
  ActivityIcon,
  CheckSquareIcon,
  MessageSquareIcon,
  CheckCheckIcon,
  PhoneIcon,
} from 'lucide-react'
import { useMitteilungen } from './useMitteilungen'
import type { Mitteilung, MitteilungKategorie } from '@/lib/mitteilungen/types'

type Tab = 'updates' | 'tasks' | 'nachrichten'

export default function MitteilungszentralePanel({
  variant = 'light',
}: {
  variant?: 'light' | 'dark'
}) {
  const router = useRouter()
  const { items, counts, totalUnread, markAsRead, markAllAsRead } = useMitteilungen()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('updates')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleClick(item: Mitteilung) {
    if (!item.gelesen) markAsRead(item.id)
    setOpen(false)
    if (item.route_url) router.push(item.route_url)
  }

  // Filter nach Tab
  const updateItems = items.filter(i => i.kategorie === 'update' || i.kategorie === 'anruf')
  const taskItems = items.filter(i => i.kategorie === 'task')
  const nachrichtenItems = items.filter(i => i.kategorie === 'nachricht')
  const visibleItems = tab === 'updates' ? updateItems : tab === 'tasks' ? taskItems : nachrichtenItems

  // Datum-Gruppierung für Updates
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  return (
    <div ref={ref} className="relative">
      {/* Glocke */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors duration-500 ${
          variant === 'dark'
            ? 'text-white hover:bg-white/10'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
        }`}
        aria-label="Mitteilungen"
      >
        <BellIcon className="w-4.5 h-4.5" fill={variant === 'dark' ? 'currentColor' : 'none'} />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] sm:w-[420px] max-h-[550px] bg-white border border-gray-200 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3 pb-0 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Mitteilungen</span>
              {totalUnread > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-[#4573A2] hover:text-[#1E3A5F] flex items-center gap-1"
                >
                  <CheckCheckIcon className="w-3.5 h-3.5" /> Alle gelesen
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-4">
              <TabBtn active={tab === 'updates'} onClick={() => setTab('updates')}
                icon={<ActivityIcon className="w-3.5 h-3.5" />} label="Updates" badge={counts.update + counts.anruf} />
              <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')}
                icon={<CheckSquareIcon className="w-3.5 h-3.5" />} label="Tasks" badge={counts.task}
                badgeColor={counts.task > 0 ? 'red' : undefined} />
              <TabBtn active={tab === 'nachrichten'} onClick={() => setTab('nachrichten')}
                icon={<MessageSquareIcon className="w-3.5 h-3.5" />} label="Nachrichten" badge={counts.nachricht} />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {visibleItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-gray-400 text-sm">
                  {tab === 'updates' ? 'Keine Updates' : tab === 'tasks' ? 'Keine offenen Tasks' : 'Keine Nachrichten'}
                </p>
              </div>
            ) : tab === 'updates' ? (
              // F-04: Updates gruppiert nach Heute/Gestern/Älter
              <>
                {renderGroup('Heute', updateItems.filter(i => new Date(i.created_at).toDateString() === today), handleClick)}
                {renderGroup('Gestern', updateItems.filter(i => new Date(i.created_at).toDateString() === yesterday), handleClick)}
                {renderGroup('Älter', updateItems.filter(i => {
                  const d = new Date(i.created_at).toDateString()
                  return d !== today && d !== yesterday
                }), handleClick)}
              </>
            ) : (
              visibleItems.map(item => (
                <MitteilungRow key={item.id} item={item} onClick={handleClick} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function renderGroup(label: string, items: Mitteilung[], onClick: (m: Mitteilung) => void) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      {items.map(item => <MitteilungRow key={item.id} item={item} onClick={onClick} />)}
    </div>
  )
}

function MitteilungRow({ item, onClick }: { item: Mitteilung; onClick: (m: Mitteilung) => void }) {
  const isAnruf = item.kategorie === 'anruf'
  const isTask = item.kategorie === 'task'
  const overdue = isTask && item.prioritaet === 'dringend'

  return (
    <button
      onClick={() => onClick(item)}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        !item.gelesen ? 'bg-[#4573A2]/5' : ''
      } ${overdue ? 'border-l-2 border-l-red-500' : ''}`}
    >
      <div className="flex items-start gap-3">
        {!item.gelesen && <div className="w-2 h-2 rounded-full bg-[#4573A2] mt-1.5 shrink-0" />}
        {item.gelesen && <div className="w-2 shrink-0" />}
        <div className="w-6 h-6 flex items-center justify-center text-sm shrink-0">
          {item.icon ?? '🔔'}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${item.gelesen ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
            {item.titel}
          </p>
          {item.inhalt && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.inhalt}</p>
          )}
          <p className="text-[11px] text-gray-300 mt-1">{timeAgo(item.created_at)}</p>
        </div>
        {isAnruf && (
          <span className="text-[10px] text-[#4573A2] font-medium flex items-center gap-0.5 shrink-0 self-center">
            <PhoneIcon className="w-3 h-3" /> Anrufen
          </span>
        )}
        {overdue && (
          <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full shrink-0 self-center">
            Überfällig
          </span>
        )}
      </div>
    </button>
  )
}

function TabBtn({
  active, onClick, icon, label, badge, badgeColor,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge: number; badgeColor?: 'red'
}) {
  return (
    <button onClick={onClick} className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
      active ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400 hover:text-gray-600'
    }`}>
      {icon} {label}
      {badge > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white leading-none ${
          badgeColor === 'red' ? 'bg-red-500' : 'bg-[#4573A2]'
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'Gerade eben'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  if (days < 7) return `vor ${days} Tag${days > 1 ? 'en' : ''}`
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
