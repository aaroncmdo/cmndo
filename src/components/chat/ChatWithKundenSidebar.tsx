'use client'

// AAR-730: Kunden-zentrierte Chat-Sidebar für KB-Portal.
// Pro Kunde ein Thread, im Thread alle Fälle dieses Kunden. Render-Teil
// nutzt ChatTimelineView (alle Kanäle + alle Fälle in einer Timeline).

import { useState } from 'react'
import { UserIcon, SearchIcon, MessageCircleIcon } from 'lucide-react'
import ChatTimelineView, { type FallOption } from './ChatTimelineView'
import type { ChatKanal } from '@/lib/communications/channels'

export type KundenThread = {
  kundeId: string
  kundeName: string
  faelle: FallOption[]
  lastMessage: string
  lastAt: string
  unreadCount: number
}

export default function ChatWithKundenSidebar({
  threads,
  currentUserId,
  visibleKanaele,
  initialKundeId,
}: {
  threads: KundenThread[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
  initialKundeId?: string | null
}) {
  const [search, setSearch] = useState('')
  const [activeKundeId, setActiveKundeId] = useState<string | null>(
    initialKundeId && threads.some(t => t.kundeId === initialKundeId)
      ? initialKundeId
      : threads[0]?.kundeId ?? null,
  )

  const filtered = threads.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      t.kundeName.toLowerCase().includes(s) ||
      t.faelle.some(f => (f.fallNummer ?? '').toLowerCase().includes(s)) ||
      t.lastMessage.toLowerCase().includes(s)
    )
  })

  const activeThread = threads.find(t => t.kundeId === activeKundeId) ?? null

  function fmtTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    }
    const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' })
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Sidebar: Kundenliste */}
      <aside className="w-80 border-r border-gray-200 flex flex-col bg-white shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h1 className="text-lg font-semibold text-[#0D1B3E]">Nachrichten</h1>
          <div className="relative mt-2">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Kunde, Fall oder Text…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-secondary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageCircleIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-400">
                {search ? 'Keine Treffer' : 'Noch keine Kunden-Chats'}
              </p>
            </div>
          ) : (
            filtered.map(t => {
              const active = activeKundeId === t.kundeId
              return (
                <button
                  key={t.kundeId}
                  onClick={() => setActiveKundeId(t.kundeId)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    active ? 'bg-[var(--brand-secondary)]/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[var(--brand-secondary)]/10 flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.kundeName}</p>
                        <span className="text-[10px] text-gray-400 shrink-0">{fmtTime(t.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-gray-500 truncate">
                          {t.faelle.length > 1 ? `${t.faelle.length} Fälle · ` : ''}
                          {t.lastMessage || '—'}
                        </p>
                        {t.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white shrink-0">
                            {t.unreadCount > 99 ? '99+' : t.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Chat-View */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-[#f8f9fb] flex flex-col">
        {activeThread ? (
          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#0D1B3E]">{activeThread.kundeName}</h2>
              <p className="text-[11px] text-gray-500">
                {activeThread.faelle.length} Fall{activeThread.faelle.length === 1 ? '' : 'e'}
                {activeThread.faelle.length > 0 && (
                  <>: {activeThread.faelle.map(f => `#${f.fallNummer ?? f.fallId.slice(0, 8)}`).join(', ')}</>
                )}
              </p>
            </div>
            <ChatTimelineView
              fallOptions={activeThread.faelle}
              currentUserId={currentUserId}
              visibleKanaele={visibleKanaele}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <MessageCircleIcon className="w-12 h-12 mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-500">Wähle einen Kunden aus der Liste</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
