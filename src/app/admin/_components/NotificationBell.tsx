'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon } from 'lucide-react'

type Notification = {
  id: string
  titel: string
  nachricht: string | null
  gelesen: boolean
  link: string | null
  created_at: string
}

export default function NotificationBell() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('benachrichtigungen')
        .select('id, titel, nachricht, gelesen, link, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('benachrichtigungen')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false),
    ])
    setItems(data ?? [])
    setUnread(count ?? 0)
  }, [supabase])

  // Initial load
  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'benachrichtigungen' },
        () => load(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleClick(item: Notification) {
    if (!item.gelesen) {
      await supabase
        .from('benachrichtigungen')
        .update({ gelesen: true })
        .eq('id', item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, gelesen: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (item.link) router.push(item.link)
  }

  async function markAllRead() {
    const unreadIds = items.filter(n => !n.gelesen).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase
      .from('benachrichtigungen')
      .update({ gelesen: true })
      .in('id', unreadIds)
    setItems(prev => prev.map(n => ({ ...n, gelesen: true })))
    setUnread(0)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 transition-colors"
        aria-label="Benachrichtigungen"
      >
        <BellIcon className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-[10px] font-bold text-gray-900 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] bg-white border border-gray-200 rounded-xl shadow-2xl shadow-black/40 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-900">Benachrichtigungen</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Alle gelesen
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-gray-400 text-sm">Keine Benachrichtigungen</p>
              </div>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-200/50 hover:bg-gray-100/50 transition-colors ${
                    !item.gelesen ? 'bg-gray-100/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className="pt-1.5 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${item.gelesen ? 'bg-transparent' : 'bg-blue-500'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${item.gelesen ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                        {item.titel}
                      </p>
                      {item.nachricht && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.nachricht}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(item.created_at)}</p>
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

// ─── Relative time ───────────────────────────────────────────────────────────

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
