'use client'

// Zentrales Chat-Fenster — Single-Window-Slot.
// Rendert den aktuell offenen Pinned-Chat über der gesamten FAB-Column.
// Es gibt IMMER nur 1 offenen Chat (store.openFallId).

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MinusIcon, XIcon } from 'lucide-react'
import { useGlobalChatStore } from '@/lib/chat/global-chat-store'
import MultiChannelChat from './MultiChannelChat'
import { KundeAvatar } from '@/components/shared/KundeAvatar'
import type { ChatKanal } from '@/lib/communications/channels'

export function ChatWindowPanel({ currentUserId }: { currentUserId: string | null }) {
  const { pinned, openFallId, close, unpin } = useGlobalChatStore()
  const chat = pinned.find((p) => p.fallId === openFallId)
  const windowRef = useRef<HTMLDivElement>(null)

  // ESC schließt das Fenster
  useEffect(() => {
    if (!chat) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') close(chat!.fallId)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [chat, close])

  // Click-outside: schließt das Fenster, lässt aber FAB-Column (Bubbles +
  // FAB-Button) durch — dadurch bleiben Drag-Drop + FAB bedienbar.
  useEffect(() => {
    if (!chat) return
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (windowRef.current?.contains(target)) return
      // FAB-Column + Inbox-Popover haben data-chat-outside-ok gesetzt
      if (target.closest('[data-chat-outside-ok]')) return
      close(chat!.fallId)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [chat, close])

  return (
    <AnimatePresence>
      {chat && (
        <>
          {/* Backdrop-Blur — pointer-events-none, damit FAB + Bubbles
              klickbar bleiben. Click-outside läuft über useEffect oben. */}
          <motion.div
            key="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9980] backdrop-blur-sm bg-black/10 pointer-events-none"
            aria-hidden
          />

          {/* Chat-Fenster — zentrale Position rechts über dem FAB */}
          <motion.div
            ref={windowRef}
            key="chat-window"
            initial={{ opacity: 0, scale: 0.92, y: 16, clipPath: 'ellipse(60% 20% at 85% 100%)' }}
            animate={{ opacity: 1, scale: 1, y: 0, clipPath: 'ellipse(200% 200% at 85% 100%)' }}
            exit={{ opacity: 0, scale: 0.92, y: 12, clipPath: 'ellipse(60% 20% at 85% 100%)' }}
            transition={{ duration: 0.28, ease: [0.34, 1.2, 0.64, 1] }}
            className="fixed bottom-20 right-4 w-80 sm:w-96 h-[480px] max-h-[calc(100vh-120px)] glass-light border border-claimondo-border rounded-ios-lg shadow-ios-lg flex flex-col overflow-hidden z-[9995]"
            role="dialog"
            aria-label={`Chat mit ${chat.kundeName}`}
          >
            {/* Header — glass-light mit leichtem Tint statt solid dark */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-claimondo-border bg-white/40 backdrop-blur-sm shrink-0">
              <KundeAvatar name={chat.kundeName} size={28} tone="navy-filled" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-claimondo-navy truncate">{chat.kundeName}</p>
                {chat.fallNummer && (
                  <p className="text-[10px] text-claimondo-ondo truncate">Fall {chat.fallNummer}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(chat.fallId)}
                className="p-1 rounded-ios-md hover:bg-black/5 transition-colors text-claimondo-ondo hover:text-claimondo-navy"
                aria-label="Chat minimieren"
                title="Minimieren"
              >
                <MinusIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => unpin(chat.fallId)}
                className="p-1 rounded-ios-md hover:bg-red-50 transition-colors text-claimondo-ondo hover:text-red-600"
                aria-label="Chat schließen und zurück in Posteingang"
                title="Schließen und in Posteingang"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <MultiChannelChat
                fallId={chat.fallId}
                currentUserId={currentUserId}
                visibleKanaele={(chat.kanaele as ChatKanal[]).length > 0 ? (chat.kanaele as ChatKanal[]) : undefined}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
