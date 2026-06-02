'use client'

// Chat-Inbox P2: Timeline-Shell (ersetzt ChatTimelineView). Props identisch ->
// drop-in an der KB-Portal-Mount-Site (ChatWithKundenSidebar).
//
// Im Gegensatz zur Tabs-Shell (ChatThreadTabs, ein Fall) rendert diese
// Komponente:
//   - ALLE Kanaele in EINER Timeline, chronologisch durchmischt
//   - ALLE Faelle eines Kunden zusammen, pro Nachricht Fall- + Kanal-Badge
//   - Reply-Selector unten (Composer-extras) mit Fall- + Kanal-Dropdown
//   - Smart-Default: Reply-Ziel = Fall + Kanal der letzten Nachricht
//
// Engine = useChatThread (Load/Realtime/Dedup/optimistic/Mark-Read). Scope
// umfasst ALLE sichtbaren Faelle+Kanaele -> markReadOnView=true markiert beim
// Laden alles gelesen (wie ChatTimelineView heute).

import { useEffect, useMemo, useRef, useState } from 'react'
import { CHAT_KANAELE, getChannelDef, type ChatKanal } from '@/lib/communications/channels'
import { useChatThread } from './useChatThread'
import { standardSender } from '@/lib/chat/thread/send-strategies'
import { MessageBubble } from './MessageBubble'
import { ChatComposer } from './ChatComposer'

export type FallOption = { fallId: string; fallNummer: string | null }

export default function ChatThreadTimeline({
  fallOptions,
  currentUserId,
  visibleKanaele,
}: {
  fallOptions: FallOption[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
}) {
  const fallIds = useMemo(() => fallOptions.map((f) => f.fallId), [fallOptions])
  const visibleChannels = useMemo(
    () => CHAT_KANAELE.filter((c) => visibleKanaele.includes(c.id)),
    [visibleKanaele],
  )

  const { messages, sendMessage, endRef } = useChatThread({
    scope: { kind: 'fall', fallIds, kanaele: visibleKanaele },
    currentUserId,
    send: standardSender,
  })

  const [fallFilter, setFallFilter] = useState<string>('alle') // 'alle' oder fallId
  const [replyFallId, setReplyFallId] = useState<string | null>(null)
  const [replyKanal, setReplyKanal] = useState<ChatKanal | null>(null)

  // Smart-Reply: Fall + Kanal der letzten Nachricht als Default (einmalig).
  const smartApplied = useRef(false)
  useEffect(() => {
    if (smartApplied.current) return
    if (messages.length > 0) {
      smartApplied.current = true
      const last = messages[messages.length - 1]
      setReplyFallId((prev) => prev ?? last.fall_id ?? fallIds[0] ?? null)
      setReplyKanal((prev) => prev ?? (last.kanal as ChatKanal))
    } else if (fallIds.length > 0 && visibleKanaele.length > 0) {
      smartApplied.current = true
      setReplyFallId((prev) => prev ?? fallIds[0])
      setReplyKanal((prev) => prev ?? visibleKanaele[0])
    }
  }, [messages, fallIds, visibleKanaele])

  const filteredMessages = useMemo(
    () => (fallFilter === 'alle' ? messages : messages.filter((m) => m.fall_id === fallFilter)),
    [messages, fallFilter],
  )

  function fallNummer(fallId: string | null): string {
    if (!fallId) return '—'
    return fallOptions.find((f) => f.fallId === fallId)?.fallNummer ?? fallId.slice(0, 8)
  }

  const replyExtras = (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <span className="text-[11px] text-claimondo-ondo">Antworten in:</span>
      {fallOptions.length > 1 && (
        <select
          value={replyFallId ?? ''}
          onChange={(e) => setReplyFallId(e.target.value)}
          className="text-xs px-2 py-1 rounded-ios-md border border-claimondo-border bg-white text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
        >
          {fallOptions.map((f) => (
            <option key={f.fallId} value={f.fallId}>
              Fall #{f.fallNummer ?? f.fallId.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
      <select
        value={replyKanal ?? ''}
        onChange={(e) => setReplyKanal(e.target.value as ChatKanal)}
        className="text-xs px-2 py-1 rounded-ios-md border border-claimondo-border bg-white text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
      >
        {visibleChannels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border flex flex-col h-[600px]">
      {/* Fall-Filter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-claimondo-border bg-claimondo-bg">
        <span className="text-xs text-claimondo-ondo">Fall-Filter:</span>
        <select
          value={fallFilter}
          onChange={(e) => setFallFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded-ios-md border border-claimondo-border bg-white text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
        >
          <option value="alle">Alle Fälle ({fallOptions.length})</option>
          {fallOptions.map((f) => (
            <option key={f.fallId} value={f.fallId}>
              #{f.fallNummer ?? f.fallId.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-claimondo-bg">
        {filteredMessages.length === 0 ? (
          <p className="text-xs text-claimondo-ondo/70 text-center py-8">Noch keine Nachrichten</p>
        ) : (
          filteredMessages.map((m) => {
            const isOwn = !!currentUserId && m.sender_id === currentUserId
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                {/* Label-Zeile: Fall + Kanal */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-claimondo-ondo bg-white border border-claimondo-border rounded px-1.5 py-0.5">
                    #{fallNummer(m.fall_id)}
                  </span>
                  <span className="text-[10px] font-medium text-claimondo-ondo bg-white border border-claimondo-border rounded px-1.5 py-0.5">
                    {getChannelDef(m.kanal as ChatKanal).label}
                  </span>
                </div>
                <MessageBubble message={m} isOwn={isOwn} variant="plain" />
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Reply-Selector + Composer */}
      <ChatComposer
        onSend={(text) => {
          void sendMessage({ kanal: replyKanal ?? visibleKanaele[0], nachricht: text, fallId: replyFallId })
        }}
        disabled={!replyFallId || !replyKanal}
        placeholder="Nachricht eingeben…"
        extras={replyExtras}
      />
    </div>
  )
}
