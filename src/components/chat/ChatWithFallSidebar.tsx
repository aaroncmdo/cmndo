'use client'

// AAR-726: Shared Chat-Layout für rollen-spezifische Portal-Posteingänge.
// Links: Fall-Liste (mit Kunden-Name, letzter Nachricht, Unread-Badge).
// Rechts: MultiChannelChat mit Smart-Reply-Default + gefilterten Kanälen.
//
// Verwendet von:
//   - /gutachter/posteingang (3 Kanäle: whatsapp, chat_kunde_sv, gruppenchat)
//   - /mitarbeiter/nachrichten (später — Kunden-zentriert, AAR-730)
//   - /kunde/chat (später — AAR-730)

import { useState } from 'react'
import { UserIcon, SearchIcon, MessageCircleIcon } from 'lucide-react'
import MultiChannelChat from './MultiChannelChat'
import type { ChatKanal } from '@/lib/communications/channels'

export type FallThread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
}

export default function ChatWithFallSidebar({
  threads,
  currentUserId,
  visibleKanaele,
  emptyHint,
  initialFallId,
}: {
  threads: FallThread[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
  emptyHint?: string
  // Ermöglicht Deep-Link mit ?fall=... — pre-selektiert den Thread.
  initialFallId?: string | null
}) {
  const [search, setSearch] = useState('')
  const [activeFallId, setActiveFallId] = useState<string | null>(
    initialFallId && threads.some(t => t.fallId === initialFallId)
      ? initialFallId
      : threads[0]?.fallId ?? null,
  )

  const filtered = threads.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      t.kundeName.toLowerCase().includes(s) ||
      (t.fallNummer ?? '').toLowerCase().includes(s) ||
      t.lastMessage.toLowerCase().includes(s)
    )
  })

  const activeThread = threads.find(t => t.fallId === activeFallId) ?? null

  function fmtTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    }
    const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 7) {
      return d.toLocaleDateString('de-DE', { weekday: 'short' })
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Linke Spalte: Thread-Liste */}
      <aside className="w-80 border-r border-claimondo-border flex flex-col bg-white shrink-0">
        <div className="px-4 py-3 border-b border-claimondo-border sticky top-0 bg-white z-10">
          <h1 className="text-lg font-semibold text-[#0D1B3E]">Nachrichten</h1>
          <div className="relative mt-2">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-claimondo-ondo/70" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Fall oder Kunde suchen..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-claimondo-border rounded-lg focus:outline-none focus:border-[var(--brand-secondary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageCircleIcon className="w-8 h-8 mx-auto text-claimondo-ondo/50 mb-2" />
              <p className="text-xs text-claimondo-ondo/70">
                {emptyHint ?? (search ? 'Keine Treffer' : 'Noch keine Chats')}
              </p>
            </div>
          ) : (
            filtered.map(t => {
              const active = activeFallId === t.fallId
              return (
                <button
                  key={t.fallId}
                  onClick={() => setActiveFallId(t.fallId)}
                  className={`w-full text-left px-3 py-3 border-b border-claimondo-border hover:bg-[#f8f9fb] transition-colors ${
                    active ? 'bg-[var(--brand-secondary)]/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[var(--brand-secondary)]/10 flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-claimondo-navy truncate">{t.kundeName}</p>
                        <span className="text-[10px] text-claimondo-ondo/70 shrink-0">{fmtTime(t.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-claimondo-ondo truncate">
                          {t.fallNummer ? `#${t.fallNummer} · ` : ''}
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

      {/* Rechte Spalte: Chat-View */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-[#f8f9fb] flex flex-col">
        {activeThread ? (
          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#0D1B3E]">{activeThread.kundeName}</h2>
              {activeThread.fallNummer && (
                <p className="text-[11px] text-claimondo-ondo">Fall #{activeThread.fallNummer}</p>
              )}
            </div>
            <MultiChannelChat
              fallId={activeThread.fallId}
              currentUserId={currentUserId}
              visibleKanaele={visibleKanaele}
              smartReplyDefault
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <MessageCircleIcon className="w-12 h-12 mx-auto text-white/80 mb-2" />
              <p className="text-sm text-claimondo-ondo">Wähle einen Chat aus der Liste</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
