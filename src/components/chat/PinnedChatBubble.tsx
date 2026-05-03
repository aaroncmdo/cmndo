'use client'

// Angeheftete Chat-Bubble (Avatar-Button mit Unread + X-Schließen).
// Das Chat-Fenster selbst liegt zentral im FAB-Container (Single-Window-Slot),
// nicht hier — damit zwei Bubbles sich nicht überlagern.
//
// HTML5-Drag: Ganze Bubble draggable. Drop-Target ist das Inbox-Popover
// (GlobalPosteingangFab), Drop = unpin. dataTransfer-MIME
// 'application/claimondo-chat' trägt die fallId.
// Touch-Geräte: X-Button ist immer sichtbar (nicht nur hover), weil
// HTML5-Drag auf Touch unzuverlässig ist.

import { motion } from 'framer-motion'
import { XIcon } from 'lucide-react'
import { useGlobalChatStore, type PinnedChat } from '@/lib/chat/global-chat-store'
import { DropletBadge } from '@/components/ui/DropletBadge'
import { KundeAvatar } from '@/components/shared/KundeAvatar'

type Props = {
  chat: PinnedChat
}

export const CHAT_DRAG_MIME = 'application/claimondo-chat'

export function PinnedChatBubble({ chat }: Props) {
  const { toggleOpen, unpin } = useGlobalChatStore()

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(CHAT_DRAG_MIME, chat.fallId)
    // Fallback für Browser die custom MIME strippen
    e.dataTransfer.setData('text/plain', `claimondo-chat:${chat.fallId}`)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="relative flex flex-col items-center gap-1 group"
      draggable
      onDragStart={handleDragStart}
      aria-grabbed={false}
    >
      <div className="relative">
        <motion.button
          type="button"
          onClick={() => toggleOpen(chat.fallId)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className={`rounded-full shadow-ios-md ring-2 transition-all cursor-grab active:cursor-grabbing ${
            chat.open
              ? 'ring-claimondo-ondo'
              : 'ring-white/20 hover:ring-claimondo-ondo/60'
          }`}
          aria-label={`Chat mit ${chat.kundeName}`}
          aria-pressed={chat.open}
          title={`${chat.kundeName} — ziehen zum Lösen`}
        >
          <KundeAvatar name={chat.kundeName} size={44} />
        </motion.button>

        {/* Unread Badge */}
        {chat.unreadCount > 0 && !chat.open && (
          <span className="absolute -top-1 -right-1 pointer-events-none">
            <DropletBadge count={chat.unreadCount} colorCls="bg-rose-500 text-white" size={18} />
          </span>
        )}

        {/* X-Button — auf Touch immer sichtbar, auf Desktop nur bei Hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            unpin(chat.fallId)
          }}
          className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-claimondo-shield text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-rose-600 transition-all"
          aria-label="Chat schließen und zurück in Posteingang"
          title="Chat schließen und zurück in Posteingang"
          style={{ fontSize: 9 }}
        >
          <XIcon className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Name label */}
      <span className="text-[9px] text-claimondo-ondo font-medium max-w-[44px] truncate text-center leading-tight">
        {chat.kundeName.split(' ')[0]}
      </span>
    </div>
  )
}
