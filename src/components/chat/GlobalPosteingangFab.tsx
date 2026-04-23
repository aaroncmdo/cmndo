'use client'

// Globaler Posteingang-FAB (unten rechts). Klick → Inbox-Popover mit Thread-Liste.
// Angeheftete Chats erscheinen als Bubbles links neben dem FAB.

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { InboxIcon, XIcon, PlusIcon, ExternalLinkIcon } from 'lucide-react'
import { useGlobalChatStore } from '@/lib/chat/global-chat-store'
import type { InboxThread } from '@/app/api/chat/inbox-threads/route'
import { DropletBadge } from '@/components/ui/DropletBadge'
import { PinnedChatBubble } from '@/components/chat/PinnedChatBubble'

export function GlobalPosteingangFab({ currentUserId }: { currentUserId: string | null }) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [loading, setLoading] = useState(false)
  const fabRef = useRef<HTMLDivElement>(null)
  const { pinned, pin } = useGlobalChatStore()

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

  // Beim ersten Render laden (für Unread-Badge auf FAB)
  useEffect(() => {
    fetchThreads()
    const interval = setInterval(fetchThreads, 30_000)
    return () => clearInterval(interval)
  }, [fetchThreads])

  // Click outside schließt Popover
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    setOpen((v) => {
      if (!v) fetchThreads()
      return !v
    })
  }

  return (
    <div
      ref={fabRef}
      className="fixed bottom-4 right-4 z-[9990] flex items-end gap-2"
    >
      {/* Angeheftete Chat-Bubbles links neben dem FAB */}
      {pinned.length > 0 && (
        <div className="flex items-end gap-1.5">
          {pinned.map((chat, i) => (
            <PinnedChatBubble
              key={chat.fallId}
              chat={chat}
              currentUserId={currentUserId}
              index={i}
            />
          ))}
        </div>
      )}

      {/* FAB + Inbox-Popover */}
      <div className="relative">
        {/* Inbox-Popover */}
        <AnimatePresence>
          {open && (
            <motion.div
              key="inbox-popover"
              initial={{ opacity: 0, scale: 0.92, y: 10, clipPath: 'ellipse(60% 20% at 50% 100%)' }}
              animate={{ opacity: 1, scale: 1, y: 0, clipPath: 'ellipse(200% 200% at 50% 100%)' }}
              exit={{ opacity: 0, scale: 0.9, y: 8, clipPath: 'ellipse(60% 20% at 50% 100%)' }}
              transition={{ duration: 0.28, ease: [0.34, 1.2, 0.64, 1] }}
              className="absolute bottom-14 right-0 w-80 glass-light border border-claimondo-border rounded-ios-lg shadow-ios-lg overflow-hidden flex flex-col"
              style={{ maxHeight: 480, zIndex: 9999 }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-claimondo-navy text-white shrink-0">
                <InboxIcon className="w-4 h-4 text-[#7BA3CC]" />
                <span className="flex-1 text-sm font-semibold">Posteingang</span>
                {totalUnread > 0 && (
                  <DropletBadge count={totalUnread} colorCls="bg-rose-500 text-white" size={18} />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-md transition-colors ml-1"
                  aria-label="Schließen"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thread-Liste */}
              <div className="flex-1 overflow-y-auto divide-y divide-claimondo-border">
                {loading && unpinnedThreads.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">Lade…</div>
                )}
                {!loading && unpinnedThreads.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    Keine offenen Nachrichten
                  </div>
                )}
                {unpinnedThreads.map((thread) => {
                  const initials = thread.kundeName
                    .split(' ')
                    .map((s) => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()

                  return (
                    <div
                      key={thread.fallId}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-claimondo-ondo/5 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-claimondo-navy flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                        {initials || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-xs font-semibold text-claimondo-navy truncate">
                            {thread.kundeName}
                          </p>
                          {thread.fallNummer && (
                            <span className="text-[10px] text-gray-400 shrink-0">
                              #{thread.fallNummer}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate leading-tight">
                          {thread.lastMessage || '…'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {thread.unreadCount > 0 && (
                          <DropletBadge
                            count={thread.unreadCount}
                            colorCls="bg-rose-500 text-white"
                            size={18}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            pin(thread)
                            setOpen(false)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-claimondo-ondo/10 transition-all"
                          title="Chat aushängen"
                          aria-label="Chat aushängen"
                        >
                          <ExternalLinkIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-claimondo-border bg-gray-50/60 shrink-0">
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-ios-sm bg-claimondo-navy text-white text-xs font-semibold hover:bg-claimondo-ondo transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Neuer Chat
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB-Button */}
        <motion.button
          type="button"
          onClick={handleOpen}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          className={`relative w-12 h-12 rounded-full bg-claimondo-navy text-white shadow-ios-lg flex items-center justify-center hover:bg-claimondo-ondo transition-colors ${totalUnread > 0 ? 'fab-ring' : ''}`}
          aria-label="Posteingang öffnen"
        >
          <InboxIcon className="w-5 h-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1">
              <DropletBadge count={totalUnread} colorCls="bg-rose-500 text-white" size={20} />
            </span>
          )}
        </motion.button>
      </div>
    </div>
  )
}
