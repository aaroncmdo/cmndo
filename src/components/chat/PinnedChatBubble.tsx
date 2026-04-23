'use client'

// Angeheftete Chat-Bubble (unten rechts neben dem Posteingang-FAB).
// Klick → öffnet/schließt ein schwebendes Mini-Chat-Fenster.
// X → entfernt die Bubble und gibt den Thread zurück an den Posteingang.

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon, MinusIcon } from 'lucide-react'
import { useGlobalChatStore, type PinnedChat } from '@/lib/chat/global-chat-store'
import MultiChannelChat from './MultiChannelChat'
import { DropletBadge } from '@/components/ui/DropletBadge'
import type { ChatKanal } from '@/lib/communications/channels'

type Props = {
  chat: PinnedChat
  currentUserId: string | null
  index: number
}

export function PinnedChatBubble({ chat, currentUserId, index }: Props) {
  const { toggleOpen, unpin } = useGlobalChatStore()
  const windowRef = useRef<HTMLDivElement>(null)

  // Click outside schließt das Chat-Fenster (nicht die Bubble)
  useEffect(() => {
    if (!chat.open) return
    function handler(e: MouseEvent) {
      if (windowRef.current && !windowRef.current.contains(e.target as Node)) {
        useGlobalChatStore.getState().close(chat.fallId)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [chat.open, chat.fallId])

  const initials = chat.kundeName
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const visibleKanaele = chat.kanaele as ChatKanal[]

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      style={{ marginRight: index * 4 }}
    >
      {/* Floating Chat Window */}
      <AnimatePresence>
        {chat.open && (
          <motion.div
            ref={windowRef}
            key="chat-window"
            initial={{ opacity: 0, scale: 0.9, y: 12, clipPath: 'ellipse(50% 20% at 50% 100%)' }}
            animate={{ opacity: 1, scale: 1, y: 0, clipPath: 'ellipse(200% 200% at 50% 100%)' }}
            exit={{ opacity: 0, scale: 0.92, y: 8, clipPath: 'ellipse(50% 20% at 50% 100%)' }}
            transition={{ duration: 0.28, ease: [0.34, 1.2, 0.64, 1] }}
            className="absolute bottom-14 right-0 w-80 sm:w-96 h-[420px] glass-light border border-claimondo-border rounded-ios-lg shadow-ios-lg flex flex-col overflow-hidden"
            style={{ zIndex: 9999 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-claimondo-border bg-claimondo-navy/95 text-white">
              <div className="w-7 h-7 rounded-full bg-claimondo-ondo flex items-center justify-center text-xs font-bold shrink-0">
                {initials || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{chat.kundeName}</p>
                {chat.fallNummer && (
                  <p className="text-[10px] text-white/60 truncate">Fall {chat.fallNummer}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => useGlobalChatStore.getState().close(chat.fallId)}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
                aria-label="Chat minimieren"
              >
                <MinusIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <MultiChannelChat
                fallId={chat.fallId}
                currentUserId={currentUserId}
                visibleKanaele={visibleKanaele.length > 0 ? visibleKanaele : undefined}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bubble Button */}
      <div className="relative">
        <motion.button
          type="button"
          onClick={() => toggleOpen(chat.fallId)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="w-11 h-11 rounded-full bg-claimondo-navy text-white shadow-ios-md flex items-center justify-center text-sm font-bold ring-2 ring-white/20 hover:bg-claimondo-shield transition-colors"
          aria-label={`Chat mit ${chat.kundeName}`}
          title={chat.kundeName}
        >
          {initials || '?'}
        </motion.button>

        {/* Unread Badge */}
        {chat.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1">
            <DropletBadge
              count={chat.unreadCount}
              colorCls="bg-rose-500 text-white"
              size={18}
            />
          </span>
        )}

        {/* X-Button (hover) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); unpin(chat.fallId) }}
          className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-gray-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-rose-600 transition-all"
          aria-label="Chat schließen"
          title="Chat schließen und zurück in Posteingang"
          style={{ fontSize: 9 }}
        >
          <XIcon className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Name label */}
      <span className="text-[9px] text-gray-500 font-medium max-w-[44px] truncate text-center leading-tight">
        {chat.kundeName.split(' ')[0]}
      </span>
    </div>
  )
}
