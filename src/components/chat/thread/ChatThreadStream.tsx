'use client'

// Chat-Inbox P2: Compact-Stream-Basis. EIN durchgehender Nachrichten-Stream +
// Composer auf dem useChatThread-Engine. Die schwere Consumer-Chrome bleibt im
// jeweiligen Wrapper (Kunde-iMessage-Card / Fokus-Bottom-Sheet / Makler-Tab) —
// diese Basis fuellt nur ihren Container (h-full).
//
// Send-Ziel ist parametrisiert (sendKanal/sendFallId/sendEmpfaengerId), damit der
// Wrapper (z. B. Kunde-Fall-Picker in composerExtras) das Ziel steuern kann.

import { type ReactNode } from 'react'
import { useChatThread } from './useChatThread'
import { MessageBubble, type SenderLabel } from './MessageBubble'
import { ChatComposer } from './ChatComposer'
import { DateSeparator } from './DateSeparator'
import type { ChatScope } from '@/lib/chat/thread/scope'
import type { ChatSender } from '@/lib/chat/thread/send-normalize'
import type { ChatKanal } from '@/lib/communications/channels'

function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Heute'
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ChatThreadStream({
  scope,
  currentUserId,
  send,
  markRead,
  markReadOnView = true,
  bubbleVariant = 'plain',
  withDateSeparators = false,
  composerExtras,
  senderLabels,
  placeholder,
  emptyHint = 'Noch keine Nachrichten',
  sendKanal,
  sendFallId,
  sendEmpfaengerId,
  className,
}: {
  scope: ChatScope
  currentUserId: string | null
  send: ChatSender
  markRead?: (scope: ChatScope, userId: string) => Promise<void>
  markReadOnView?: boolean
  bubbleVariant?: 'tint' | 'avatar' | 'plain'
  withDateSeparators?: boolean
  composerExtras?: ReactNode | ((api: { sendText: (text: string) => void }) => ReactNode)
  /** SenderLabel je sender_id (fuer variant='avatar'). */
  senderLabels?: Record<string, SenderLabel>
  placeholder?: string
  emptyHint?: string
  sendKanal?: ChatKanal
  sendFallId?: string | null
  sendEmpfaengerId?: string | null
  className?: string
}) {
  const { messages, sendMessage, endRef } = useChatThread({
    scope,
    currentUserId,
    send,
    markRead,
    markReadOnView,
  })

  const effectiveKanal =
    sendKanal ?? (scope.kind === 'kanal-allowlist' ? scope.kanal : scope.kanaele[0])

  const sendText = (text: string) => {
    if (!effectiveKanal) return
    void sendMessage({
      kanal: effectiveKanal,
      nachricht: text,
      fallId: sendFallId,
      empfaengerId: sendEmpfaengerId,
    })
  }
  // composerExtras darf eine Render-Funktion sein (bekommt sendText) — z. B. Fokus-Quick-Replies (tap-to-send).
  const resolvedExtras =
    typeof composerExtras === 'function' ? composerExtras({ sendText }) : composerExtras

  let lastDay = ''

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <p className="text-center text-claimondo-ondo/70 text-xs py-8">{emptyHint}</p>
        ) : (
          messages.map((m) => {
            const out: ReactNode[] = []
            if (withDateSeparators) {
              const dl = dayLabel(m.created_at)
              if (dl && dl !== lastDay) {
                lastDay = dl
                out.push(<DateSeparator key={`sep-${m.id}`} label={dl} />)
              }
            }
            out.push(
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={!!currentUserId && m.sender_id === currentUserId}
                variant={bubbleVariant}
                senderLabel={m.sender_id ? senderLabels?.[m.sender_id] : undefined}
              />,
            )
            return out
          })
        )}
        <div ref={endRef} />
      </div>
      {effectiveKanal && (
        <ChatComposer placeholder={placeholder} extras={resolvedExtras} onSend={sendText} />
      )}
    </div>
  )
}
