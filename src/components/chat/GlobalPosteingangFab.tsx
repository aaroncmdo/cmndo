'use client'

// Globaler Posteingang-FAB (unten rechts). Klick → Inbox-Popover mit Thread-Liste.
// Angeheftete Chats erscheinen als Bubble-Stack links neben dem FAB.
// Chat-Fenster wird zentral vom ChatWindowPanel gerendert (Single-Slot).

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { InboxIcon, XIcon, PlusIcon, SearchIcon, ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { useGlobalChatStore } from '@/lib/chat/global-chat-store'
import type { InboxThread } from '@/app/api/chat/inbox-threads/route'
import type { FallLookupResult } from '@/app/api/chat/fall-lookup/route'
import { DropletBadge } from '@/components/ui/DropletBadge'
import { PinnedChatBubble, CHAT_DRAG_MIME } from '@/components/chat/PinnedChatBubble'
import { ChatWindowPanel } from '@/components/chat/ChatWindowPanel'
import { KundeAvatar } from '@/components/shared/KundeAvatar'
import { createClient } from '@/lib/supabase/client'

export function GlobalPosteingangFab({ currentUserId }: { currentUserId: string | null }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'inbox' | 'new'>('inbox')
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FallLookupResult[]>([])
  const [searching, setSearching] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const { pinned, pin, unpin } = useGlobalChatStore()

  const pinnedIds = new Set(pinned.map((p) => p.fallId))
  const unpinnedThreads = threads.filter((t) => !pinnedIds.has(t.fallId))

  const inboxUnread = unpinnedThreads.reduce((sum, t) => sum + t.unreadCount, 0)
  const pinnedUnread = pinned.reduce((sum, p) => sum + p.unreadCount, 0)
  const totalUnread = inboxUnread + pinnedUnread

  const fetchThreads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chat/inbox-threads')
      const data = await res.json()
      setThreads(data.threads ?? [])
    } catch {
      // Netzwerkfehler still ignorieren
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial + Realtime: beim Mount laden, dann auf nachrichten-Changes hören.
  // Polling nur als Fallback (2min) falls Realtime nicht greift.
  useEffect(() => {
    fetchThreads()
    const supabase = createClient()
    const channel = supabase
      .channel(`global-inbox-${currentUserId ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nachrichten' }, () => fetchThreads())
      .subscribe()
    const interval = setInterval(fetchThreads, 120_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchThreads, currentUserId])

  // Click outside schließt Popover
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC schließt Popover
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (view === 'new') { setView('inbox'); setSearchQuery('') }
        else setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, view])

  function handleOpen() {
    setOpen((v) => {
      if (!v) {
        fetchThreads()
        setView('inbox')
      }
      return !v
    })
  }

  // Fall-Suche (debounced)
  useEffect(() => {
    if (view !== 'new' || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/fall-lookup?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.results ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [searchQuery, view])

  // Drag-Drop Unpin: Bubble wird aufs Inbox-Popover gezogen → unpin.
  // Das Popover muss geöffnet werden damit User ein Drop-Ziel sieht; wir
  // öffnen es automatisch bei DragEnter auf den FAB, wenn noch zu.
  function extractDraggedFallId(dt: DataTransfer): string | null {
    const primary = dt.getData(CHAT_DRAG_MIME)
    if (primary) return primary
    const fallback = dt.getData('text/plain')
    if (fallback.startsWith('claimondo-chat:')) return fallback.slice('claimondo-chat:'.length)
    return null
  }

  function isClaimondoChatDrag(dt: DataTransfer): boolean {
    return dt.types.includes(CHAT_DRAG_MIME) || dt.types.includes('text/plain')
  }

  function handlePopoverDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isClaimondoChatDrag(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOver) setDragOver(true)
  }

  function handlePopoverDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Nur resetten wenn der Pointer wirklich das Popover verlässt
    if (popoverRef.current && !popoverRef.current.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }

  function handlePopoverDrop(e: React.DragEvent<HTMLDivElement>) {
    const fallId = extractDraggedFallId(e.dataTransfer)
    setDragOver(false)
    if (!fallId) return
    e.preventDefault()
    unpin(fallId)
  }

  function handleFabDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    if (!isClaimondoChatDrag(e.dataTransfer)) return
    e.preventDefault()
    if (!open) setOpen(true)
  }

  function startNewChat(result: FallLookupResult) {
    pin({
      fallId: result.fallId,
      fallNummer: result.fallNummer,
      kundeName: result.kundeName,
      lastMessage: '',
      lastAt: new Date().toISOString(),
      unreadCount: 0,
      kanaele: [],
    })
    setOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setView('inbox')
  }

  return (
    <>
      {/* Zentraler Chat-Window-Slot (Single-Window). */}
      <ChatWindowPanel currentUserId={currentUserId} />

      <div
        data-chat-outside-ok
        className="fixed bottom-4 right-4 z-[9990] flex items-end gap-2"
      >
        {/* Angeheftete Chat-Bubbles links neben dem FAB */}
        {pinned.length > 0 && (
          <div className="flex items-end gap-1.5">
            {pinned.map((chat) => (
              <PinnedChatBubble key={chat.fallId} chat={chat} />
            ))}
          </div>
        )}

        {/* FAB + Inbox-Popover */}
        <div className="relative" ref={popoverRef}>
          {/* Backdrop-Blur auf Main-Content wenn Popover offen (wie UpdatesNav). */}
          <AnimatePresence>
            {open && (
              <motion.div
                key="inbox-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[9985] backdrop-blur-sm bg-black/10 pointer-events-none"
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Inbox-Popover */}
          <AnimatePresence>
            {open && (
              <motion.div
                key="inbox-popover"
                initial={{ opacity: 0, scale: 0.92, y: 10, clipPath: 'ellipse(60% 20% at 50% 100%)' }}
                animate={{ opacity: 1, scale: 1, y: 0, clipPath: 'ellipse(200% 200% at 50% 100%)' }}
                exit={{ opacity: 0, scale: 0.9, y: 8, clipPath: 'ellipse(60% 20% at 50% 100%)' }}
                transition={{ duration: 0.28, ease: [0.34, 1.2, 0.64, 1] }}
                onDragOver={handlePopoverDragOver}
                onDragLeave={handlePopoverDragLeave}
                onDrop={handlePopoverDrop}
                className={`absolute bottom-14 right-0 w-80 glass-light border rounded-ios-lg shadow-ios-lg overflow-hidden flex flex-col z-[9995] transition-[box-shadow,border-color] ${
                  dragOver
                    ? 'border-claimondo-ondo ring-4 ring-claimondo-ondo/30'
                    : 'border-claimondo-border'
                }`}
                style={{ maxHeight: 480 }}
              >
                {/* Header — glass-light Tint statt solid navy */}
                <div className="flex items-center gap-2 px-4 py-3 bg-white/40 backdrop-blur-sm border-b border-claimondo-border shrink-0">
                  {view === 'new' ? (
                    <button
                      type="button"
                      onClick={() => { setView('inbox'); setSearchQuery('') }}
                      className="p-1 hover:bg-black/5 rounded-md transition-colors -ml-1 text-claimondo-navy"
                      aria-label="Zurück"
                    >
                      <ArrowLeftIcon className="w-4 h-4" />
                    </button>
                  ) : (
                    <InboxIcon className="w-4 h-4 text-claimondo-ondo" />
                  )}
                  <span className="flex-1 text-sm font-semibold text-claimondo-navy">
                    {view === 'new' ? 'Neuer Chat' : 'Posteingang'}
                  </span>
                  {view === 'inbox' && totalUnread > 0 && (
                    <DropletBadge count={totalUnread} colorCls="bg-red-500 text-white" size={18} />
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1 hover:bg-black/5 rounded-md transition-colors ml-1 text-claimondo-ondo hover:text-claimondo-navy"
                    aria-label="Schließen"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body: Inbox oder Neuer-Chat-Suche */}
                {view === 'inbox' ? (
                  <div className="flex-1 overflow-y-auto divide-y divide-claimondo-border">
                    {loading && unpinnedThreads.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-claimondo-ondo/70">Lade…</div>
                    )}
                    {!loading && unpinnedThreads.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-claimondo-ondo/70">
                        Keine offenen Nachrichten
                      </div>
                    )}
                    {unpinnedThreads.map((thread) => (
                      <button
                        type="button"
                        key={thread.fallId}
                        onClick={() => { pin(thread); setOpen(false) }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-claimondo-ondo/5 transition-colors group text-left"
                      >
                        <KundeAvatar name={thread.kundeName} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-semibold text-claimondo-navy truncate">
                              {thread.kundeName}
                            </p>
                            {thread.fallNummer && (
                              <span className="text-[10px] text-claimondo-ondo/70 shrink-0">
                                #{thread.fallNummer}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-claimondo-ondo truncate leading-tight">
                            {thread.lastMessage || '…'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {thread.unreadCount > 0 && (
                            <DropletBadge count={thread.unreadCount} colorCls="bg-red-500 text-white" size={18} />
                          )}
                          <span className="opacity-0 group-hover:opacity-100 p-1 transition-all" title="Chat anheften">
                            <ExternalLinkIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-claimondo-border shrink-0 bg-white/30 backdrop-blur-sm">
                      <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Kunde oder Fall-Nr. suchen…"
                          autoFocus
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-claimondo-border rounded-ios-sm placeholder-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-claimondo-border">
                      {searchQuery.trim().length < 2 && (
                        <div className="px-4 py-6 text-center text-xs text-claimondo-ondo/70">
                          Mindestens 2 Zeichen eingeben
                        </div>
                      )}
                      {searchQuery.trim().length >= 2 && searching && searchResults.length === 0 && (
                        <div className="px-4 py-6 text-center text-xs text-claimondo-ondo/70">Suche…</div>
                      )}
                      {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                        <div className="px-4 py-6 text-center text-xs text-claimondo-ondo/70">
                          Keine Fälle gefunden
                        </div>
                      )}
                      {searchResults.map((r) => (
                        <button
                          key={r.fallId}
                          type="button"
                          onClick={() => startNewChat(r)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-claimondo-ondo/5 transition-colors text-left"
                        >
                          <KundeAvatar name={r.kundeName} size={32} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-claimondo-navy truncate">
                              {r.kundeName}
                            </p>
                            {r.fallNummer && (
                              <p className="text-[10px] text-claimondo-ondo/70">Fall {r.fallNummer}</p>
                            )}
                          </div>
                          <PlusIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer — nur im Inbox-View */}
                {view === 'inbox' && (
                  <div className="px-4 py-3 border-t border-claimondo-border bg-white/30 backdrop-blur-sm shrink-0">
                    <button
                      type="button"
                      onClick={() => setView('new')}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-ios-sm bg-claimondo-navy text-white text-xs font-semibold hover:bg-claimondo-ondo transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      Neuer Chat
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* FAB-Button */}
          <motion.button
            type="button"
            onClick={handleOpen}
            onDragEnter={handleFabDragEnter}
            onDragOver={(e) => {
              if (isClaimondoChatDrag(e.dataTransfer)) e.preventDefault()
            }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className={`relative w-12 h-12 rounded-full bg-claimondo-navy text-white shadow-ios-lg flex items-center justify-center hover:bg-claimondo-ondo transition-colors ${totalUnread > 0 ? 'fab-ring' : ''}`}
            aria-label="Posteingang öffnen"
            aria-expanded={open}
          >
            <InboxIcon className="w-5 h-5" />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 pointer-events-none">
                <DropletBadge count={totalUnread} colorCls="bg-red-500 text-white" size={20} />
              </span>
            )}
          </motion.button>
        </div>
      </div>
    </>
  )
}
