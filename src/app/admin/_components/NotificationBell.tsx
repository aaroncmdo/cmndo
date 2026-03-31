'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, MessageSquareIcon, ActivityIcon } from 'lucide-react'

type Notification = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  link: string | null
  gelesen: boolean
  erstellt_am: string
}

type Tab = 'updates' | 'nachrichten'

const TYP_ICONS: Record<string, string> = {
  'neuer-lead': '📋', 'neuer-fall': '📁', 'gutachten-upload': '📄', 'qc-bestanden': '✅',
  'qc-fehlgeschlagen': '❌', 'kanzlei-uebergabe': '⚖️', 'zahlung': '💶', 'task-zugewiesen': '📌',
  'task-ueberfaellig': '⚠️', 'termin-bestaetigt': '📅', 'dokument-upload': '📎',
  'chat': '💬', 'system': '🔔',
}

export default function NotificationBell() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('updates')
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('benachrichtigungen')
        .select('id, typ, titel, beschreibung, link, gelesen, erstellt_am')
        .order('erstellt_am', { ascending: false })
        .limit(20),
      supabase
        .from('benachrichtigungen')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false),
    ])
    setItems(data ?? [])
    setUnread(count ?? 0)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'benachrichtigungen' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleClick(item: Notification) {
    if (!item.gelesen) {
      await supabase.from('benachrichtigungen').update({ gelesen: true }).eq('id', item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, gelesen: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (item.link) router.push(item.link)
  }

  async function markAllRead() {
    const ids = items.filter(n => !n.gelesen).map(n => n.id)
    if (!ids.length) return
    await supabase.from('benachrichtigungen').update({ gelesen: true }).in('id', ids)
    setItems(prev => prev.map(n => ({ ...n, gelesen: true })))
    setUnread(0)
  }

  // Split into tabs
  const chatTypes = new Set(['chat', 'nachricht'])
  const nachrichten = items.filter(i => chatTypes.has(i.typ))
  const updates = items.filter(i => !chatTypes.has(i.typ))
  const visibleItems = tab === 'nachrichten' ? nachrichten : updates

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        aria-label="Benachrichtigungen">
        <BellIcon className="w-4.5 h-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[350px] max-h-[500px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* Header + Tabs */}
          <div className="px-4 pt-3 pb-0 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Benachrichtigungen</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-blue-600 hover:text-blue-500 transition-colors">
                  Alle gelesen
                </button>
              )}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setTab('updates')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === 'updates' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                <ActivityIcon className="w-3.5 h-3.5" /> Updates
              </button>
              <button onClick={() => setTab('nachrichten')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === 'nachrichten' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                <MessageSquareIcon className="w-3.5 h-3.5" /> Nachrichten
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto">
            {visibleItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-gray-400 text-sm">Keine {tab === 'nachrichten' ? 'Nachrichten' : 'Updates'}</p>
              </div>
            ) : (
              visibleItems.map(item => (
                <button key={item.id} onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!item.gelesen ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    {!item.gelesen && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                    {item.gelesen && <div className="w-2 shrink-0" />}
                    <div className="w-6 h-6 flex items-center justify-center text-sm shrink-0">
                      {TYP_ICONS[item.typ] ?? '🔔'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${item.gelesen ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                        {item.titel}
                      </p>
                      {item.beschreibung && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.beschreibung}</p>}
                      <p className="text-[11px] text-gray-300 mt-1">{timeAgo(item.erstellt_am)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
