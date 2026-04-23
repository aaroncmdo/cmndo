'use client'

// AAR-730: Kunden-zentrierte Chat-Timeline für KB-Portal.
//
// Im Gegensatz zu MultiChannelChat (Tabs pro Kanal, ein Fall) rendert diese
// Komponente:
//   - ALLE Kanäle in EINER Timeline, chronologisch durchmischt
//   - ALLE Fälle eines Kunden zusammen, pro Nachricht Fall-Badge
//   - Reply-Selector unten mit Kanal- + Fall-Dropdown
//   - Smart-Default: Reply-Ziel = Kanal + Fall der letzten Nachricht
//
// Wird vom KB-Portal (/mitarbeiter/nachrichten) genutzt. Gutachter-
// Posteingang + Kunde-Chat bleiben bei MultiChannelChat (ein Fall pro
// Chat-Zeit, Tabs sind dort OK).

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CHAT_KANAELE, getChannelDef, type ChatKanal } from '@/lib/communications/channels'
import { sendChatMessage, markMessagesRead } from '@/lib/communications/send-chat'
import { SendIcon } from 'lucide-react'

type Nachricht = {
  id: string
  fall_id: string
  kanal: string
  sender_id: string | null
  sender_rolle: string | null
  nachricht: string
  created_at: string
  richtung: string | null
  gelesen: boolean | null
  is_system: boolean | null
}

export type FallOption = { fallId: string; fallNummer: string | null }

export default function ChatTimelineView({
  fallOptions,
  currentUserId,
  visibleKanaele,
}: {
  fallOptions: FallOption[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
}) {
  const [messages, setMessages] = useState<Nachricht[]>([])
  const [fallFilter, setFallFilter] = useState<string>('alle') // 'alle' oder fallId
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [replyFallId, setReplyFallId] = useState<string | null>(null)
  const [replyKanal, setReplyKanal] = useState<ChatKanal | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fallIds = useMemo(() => fallOptions.map(f => f.fallId), [fallOptions])

  const visibleChannels = CHAT_KANAELE.filter(c => visibleKanaele.includes(c.id))

  const loadMessages = useCallback(async () => {
    if (fallIds.length === 0) { setMessages([]); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('nachrichten')
      .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, created_at, richtung, gelesen, is_system')
      .in('fall_id', fallIds)
      .in('kanal', visibleKanaele)
      .order('created_at', { ascending: true })
      .limit(500)
    const msgs = (data ?? []) as Nachricht[]
    setMessages(msgs)
    // Smart-Reply: Kanal + Fall der letzten Nachricht als Default.
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1]
      setReplyFallId(prev => prev ?? last.fall_id)
      setReplyKanal(prev => prev ?? (last.kanal as ChatKanal))
    } else if (fallIds.length > 0) {
      setReplyFallId(prev => prev ?? fallIds[0])
      setReplyKanal(prev => prev ?? visibleKanaele[0])
    }
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)
    // Mark-as-read über alle Kanäle
    for (const k of visibleKanaele) {
      for (const fid of fallIds) markMessagesRead(fid, k).catch(() => {})
    }
  }, [fallIds, visibleKanaele])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Realtime über mehrere fallIds: wir abonnieren alle INSERTs und filtern
  // Client-seitig, weil Supabase-Filter-Strings kein `in.(...)` nativ können
  // für postgres_changes.
  useEffect(() => {
    if (fallIds.length === 0) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat-kunde:${fallIds.join(',')}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'nachrichten',
      }, (payload) => {
        const row = payload.new as Nachricht
        if (!fallIds.includes(row.fall_id)) return
        if (!visibleKanaele.includes(row.kanal as ChatKanal)) return
        setMessages(prev => [...prev, row])
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
        if (row.sender_id !== currentUserId) {
          markMessagesRead(row.fall_id, row.kanal as ChatKanal).catch(() => {})
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fallIds, visibleKanaele, currentUserId])

  const filteredMessages = fallFilter === 'alle'
    ? messages
    : messages.filter(m => m.fall_id === fallFilter)

  function fmtDateTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  async function handleSend() {
    if (!input.trim() || sending || !replyFallId || !replyKanal) return
    setSending(true)
    try {
      await sendChatMessage({ fallId: replyFallId, kanal: replyKanal, nachricht: input })
      setInput('')
    } finally {
      setSending(false)
    }
  }

  function fallNummer(fallId: string) {
    return fallOptions.find(f => f.fallId === fallId)?.fallNummer ?? fallId.slice(0, 8)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 flex flex-col h-[600px]">
      {/* Filter-Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-[#f8f9fb]">
        <span className="text-xs text-gray-500">Fall-Filter:</span>
        <select
          value={fallFilter}
          onChange={e => setFallFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white focus:outline-none focus:border-[#4573A2]"
        >
          <option value="alle">Alle Fälle ({fallOptions.length})</option>
          {fallOptions.map(f => (
            <option key={f.fallId} value={f.fallId}>
              #{f.fallNummer ?? f.fallId.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filteredMessages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Noch keine Nachrichten</p>
        ) : (
          filteredMessages.map(m => {
            const chan = getChannelDef(m.kanal as ChatKanal)
            const isOutbound = m.sender_id === currentUserId || m.richtung === 'outbound'
            return (
              <div
                key={m.id}
                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {/* Badges: Fall + Kanal */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                      #{fallNummer(m.fall_id)}
                    </span>
                    <span
                      className="text-[10px] font-medium rounded px-1.5 py-0.5"
                      style={{ backgroundColor: `${chan.color}20`, color: chan.color }}
                    >
                      {chan.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDateTime(m.created_at)}</span>
                  </div>
                  {/* Message-Bubble */}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      isOutbound
                        ? 'bg-[#4573A2] text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {m.nachricht}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Reply-Selector + Input */}
      <div className="border-t border-gray-100 bg-white p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500">Antworten in:</span>
          {fallOptions.length > 1 && (
            <select
              value={replyFallId ?? ''}
              onChange={e => setReplyFallId(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white focus:outline-none focus:border-[#4573A2]"
            >
              {fallOptions.map(f => (
                <option key={f.fallId} value={f.fallId}>
                  Fall #{f.fallNummer ?? f.fallId.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          <select
            value={replyKanal ?? ''}
            onChange={e => setReplyKanal(e.target.value as ChatKanal)}
            className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white focus:outline-none focus:border-[#4573A2]"
          >
            {visibleChannels.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Nachricht eingeben…"
            rows={2}
            className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#4573A2]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending || !replyFallId || !replyKanal}
            className="self-end inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#1E3A5F] text-white hover:bg-[#4573A2] disabled:opacity-40"
            aria-label="Senden"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
