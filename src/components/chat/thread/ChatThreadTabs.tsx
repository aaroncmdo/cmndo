'use client'

// Chat-Inbox P2: Tabs-Shell (ersetzt MultiChannelChat). Props identisch zu
// MultiChannelChat -> drop-in an den 4 Mount-Sites.
//
// Scope = ALLE sichtbaren Kanaele (eine Subscription) -> unreadByKanal speist die
// Tab-Badges; die Anzeige filtert auf den aktiven Tab. markReadOnView=false; der
// aktive Kanal wird separat in der DB als gelesen markiert (sein Badge = 0).

import { useEffect, useMemo, useRef, useState } from 'react'
import { CHAT_KANAELE, type ChatKanal } from '@/lib/communications/channels'
import { useChatThread } from './useChatThread'
import { standardSender } from '@/lib/chat/thread/send-strategies'
import { standardMarkRead } from './mark-read-exec'
import { KanalTabBar } from './KanalTabBar'
import { MessageBubble } from './MessageBubble'
import { ChatComposer } from './ChatComposer'
import { Card } from '@/components/primitives'

export default function ChatThreadTabs({
  fallId,
  currentUserId,
  showInternalKbSvChat = false,
  defaultKanal = 'whatsapp',
  empfaengerHints,
  visibleKanaele,
  smartReplyDefault = false,
}: {
  fallId: string
  currentUserId: string | null
  showInternalKbSvChat?: boolean
  defaultKanal?: ChatKanal
  empfaengerHints?: Partial<Record<ChatKanal, string | null>>
  visibleKanaele?: ChatKanal[]
  smartReplyDefault?: boolean
}) {
  const kanaele = useMemo<ChatKanal[]>(
    () =>
      (visibleKanaele
        ? CHAT_KANAELE.filter((c) => visibleKanaele.includes(c.id))
        : CHAT_KANAELE.filter((c) => (c.id === 'chat_kb_sv' ? showInternalKbSvChat : c.visibleInInbox))
      ).map((c) => c.id),
    [visibleKanaele, showInternalKbSvChat],
  )

  const [activeKanal, setActiveKanal] = useState<ChatKanal>(defaultKanal)
  const { messages, sendMessage, unreadByKanal, endRef } = useChatThread({
    scope: { kind: 'fall', fallIds: [fallId], kanaele },
    currentUserId,
    send: standardSender,
    markReadOnView: false,
  })

  // Smart-Reply: aktiven Kanal einmalig auf den der letzten Nachricht setzen.
  const smartApplied = useRef(false)
  useEffect(() => {
    if (!smartReplyDefault || smartApplied.current || messages.length === 0) return
    smartApplied.current = true
    const last = messages[messages.length - 1]
    const k = last?.kanal as ChatKanal | undefined
    if (k && kanaele.includes(k)) setActiveKanal(k)
  }, [smartReplyDefault, messages, kanaele])

  // Aktiven Kanal in der DB als gelesen markieren (Wechsel + neue Aktivitaet).
  useEffect(() => {
    if (!currentUserId) return
    standardMarkRead({ kind: 'fall', fallIds: [fallId], kanaele: [activeKanal] }, currentUserId).catch(() => {})
  }, [activeKanal, fallId, currentUserId, messages.length])

  const shown = useMemo(() => messages.filter((m) => m.kanal === activeKanal), [messages, activeKanal])
  const badges = useMemo(() => ({ ...unreadByKanal, [activeKanal]: 0 }), [unreadByKanal, activeKanal])
  const activeLabel = CHAT_KANAELE.find((c) => c.id === activeKanal)?.label ?? ''

  return (
    <Card p={0} className="flex flex-col h-[600px]">
      <KanalTabBar kanaele={kanaele} active={activeKanal} onSelect={setActiveKanal} unreadByKanal={badges} />
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-claimondo-bg">
        {shown.length === 0 ? (
          <p className="text-center text-claimondo-ondo/70 text-sm py-10">Noch keine Nachrichten in diesem Kanal.</p>
        ) : (
          shown.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isOwn={!!currentUserId && m.sender_id === currentUserId}
              variant="tint"
            />
          ))
        )}
        <div ref={endRef} />
      </div>
      <ChatComposer
        onSend={(text) => {
          void sendMessage({ kanal: activeKanal, nachricht: text, empfaengerId: empfaengerHints?.[activeKanal] ?? null })
        }}
        placeholder={`Nachricht über ${activeLabel}…`}
      />
    </Card>
  )
}
