'use client'

// AAR-102: Shared Multi-Channel Chat Komponente mit 5 Kanal-Tabs.
// Nutzt Supabase Realtime fuer Live-Messages.
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CHAT_KANAELE, type ChatKanal } from '@/lib/communications/channels'
import { sendChatMessage, markMessagesRead } from '@/lib/communications/send-chat'
import { SendIcon } from 'lucide-react'

type Nachricht = {
  id: string
  fall_id: string
  kanal: string
  sender_id: string | null
  sender_rolle: string | null
  empfaenger_id: string | null
  nachricht: string
  hat_anhang: boolean | null
  anhang_url: string | null
  anhang_typ: string | null
  gelesen: boolean | null
  richtung: string | null
  created_at: string
  is_system: boolean | null
}

export default function MultiChannelChat({
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
  // AAR-541 (C4): expliziter Whitelist-Override für rollenabhängige Sichten.
  // Wenn gesetzt, wird die Channel-Liste ausschließlich aus dieser Menge
  // gebildet (showInternalKbSvChat bleibt zusätzlich additiv).
  visibleKanaele?: ChatKanal[]
  // AAR-726: Smart-Reply. Wenn true, lädt beim Mount die letzte Nachricht
  // über alle sichtbaren Kanäle und setzt den aktiven Kanal auf den Kanal
  // dieser Nachricht. So antwortet der User automatisch im Kanal der
  // letzten Interaktion — default-Setting das am häufigsten gewünscht ist.
  smartReplyDefault?: boolean
}) {
  const [activeKanal, setActiveKanal] = useState<ChatKanal>(defaultKanal)
  const [messages, setMessages] = useState<Nachricht[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const visibleChannels = visibleKanaele
    ? CHAT_KANAELE.filter(c => visibleKanaele.includes(c.id))
    : CHAT_KANAELE.filter(c =>
        c.id === 'chat_kb_sv' ? showInternalKbSvChat : c.visibleInInbox,
      )

  const loadMessages = useCallback(async (kanal: ChatKanal) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('nachrichten')
      .select('*')
      .eq('fall_id', fallId)
      .eq('kanal', kanal)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    // Auto-scroll + als gelesen markieren
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)
    markMessagesRead(fallId, kanal).catch(() => {})
  }, [fallId])

  const loadUnreadCounts = useCallback(async () => {
    const supabase = createClient()
    const counts: Record<string, number> = {}
    for (const c of visibleChannels) {
      const { count } = await supabase
        .from('nachrichten')
        .select('id', { count: 'exact', head: true })
        .eq('fall_id', fallId)
        .eq('kanal', c.id)
        .eq('gelesen', false)
        .neq('sender_id', currentUserId ?? '')
      counts[c.id] = count ?? 0
    }
    setUnreadCounts(counts)
  }, [fallId, visibleChannels, currentUserId])

  useEffect(() => { loadMessages(activeKanal) }, [activeKanal, loadMessages])
  useEffect(() => { loadUnreadCounts() }, [loadUnreadCounts])

  // AAR-726: Smart-Reply — beim ersten Mount den Kanal der letzten
  // Nachricht über alle sichtbaren Kanäle als aktiv setzen. Wir führen
  // das nur EINMAL aus (Ref-Guard) — danach darf der User frei wechseln.
  const smartReplyAppliedRef = useRef(false)
  useEffect(() => {
    if (!smartReplyDefault || smartReplyAppliedRef.current) return
    if (visibleChannels.length === 0) return
    smartReplyAppliedRef.current = true
    const supabase = createClient()
    supabase
      .from('nachrichten')
      .select('kanal')
      .eq('fall_id', fallId)
      .in('kanal', visibleChannels.map(c => c.id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const lastKanal = data?.kanal as ChatKanal | undefined
        if (lastKanal && visibleChannels.some(c => c.id === lastKanal) && lastKanal !== activeKanal) {
          setActiveKanal(lastKanal)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartReplyDefault, fallId])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${fallId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'nachrichten',
        filter: `fall_id=eq.${fallId}`,
      }, (payload) => {
        const row = payload.new as Nachricht
        if (row.kanal === activeKanal) {
          setMessages(prev => [...prev, row])
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
          if (row.sender_id !== currentUserId) {
            markMessagesRead(fallId, activeKanal).catch(() => {})
          }
        }
        loadUnreadCounts()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fallId, activeKanal, currentUserId, loadUnreadCounts])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await sendChatMessage({
        fallId,
        kanal: activeKanal,
        nachricht: input,
        empfaengerId: empfaengerHints?.[activeKanal] ?? null,
      })
      setInput('')
      // Realtime liefert die Nachricht zurueck - kein manueller Refresh noetig
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border flex flex-col h-[600px]">
      {/* Tabs */}
      <div className="flex border-b border-claimondo-border overflow-x-auto">
        {visibleChannels.map(c => {
          const Icon = c.icon
          const unread = unreadCounts[c.id] ?? 0
          const active = activeKanal === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveKanal(c.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                active ? 'border-claimondo-ondo text-claimondo-navy' : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <Icon className="w-4 h-4" style={{ color: c.color }} />
              <span className="text-sm font-medium">{c.label}</span>
              {unread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unread}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-claimondo-bg">
        {messages.length === 0 ? (
          <p className="text-center text-claimondo-ondo/70 text-sm py-10">Noch keine Nachrichten in diesem Kanal.</p>
        ) : (
          messages.map(m => <MessageBubble key={m.id} message={m} currentUserId={currentUserId} />)
        )}
      </div>

      {/* Input */}
      <div className="border-t border-claimondo-border p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={`Nachricht ueber ${visibleChannels.find(c => c.id === activeKanal)?.label}...`}
          className="flex-1 px-4 py-2.5 bg-claimondo-bg border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="px-4 py-2.5 bg-claimondo-ondo text-white rounded-xl text-sm font-medium hover:bg-claimondo-navy disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <SendIcon className="w-4 h-4" />
          {sending ? 'Sende...' : 'Senden'}
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ message, currentUserId }: { message: Nachricht; currentUserId: string | null }) {
  const isSystem = message.is_system

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="inline-block text-[10px] text-claimondo-ondo bg-white border border-claimondo-border rounded-full px-3 py-1">
          {message.nachricht}
        </span>
      </div>
    )
  }

  // Eigene Nachricht: rechts, navy gefuellt (WhatsApp-Convention).
  // Andere Nachrichten: links, mit Rolle-spezifischem Tint damit der KB im
  // Multi-User-Verlauf sofort sieht ob das vom Kunden, einem anderen
  // Mitarbeiter (KB/Admin/Dispatch) oder vom SV kommt.
  const isOwnMsg = !!(currentUserId && message.sender_id === currentUserId)
  const alignRight = isOwnMsg
  const senderRolle = (message.sender_rolle ?? '').toLowerCase()
  const istKunde = senderRolle === 'kunde'
  const istSv = senderRolle === 'sachverstaendiger'
  const istMitarbeiter = ['kundenbetreuer', 'admin', 'dispatch'].includes(senderRolle)

  let bubbleCls: string
  let linkCls: string
  let timeCls: string
  let labelCls = 'text-claimondo-ondo'
  if (isOwnMsg) {
    bubbleCls = 'bg-claimondo-navy text-white'
    linkCls = 'text-white/80'
    timeCls = 'text-white/60'
  } else if (istKunde) {
    bubbleCls = 'bg-white border border-claimondo-border text-claimondo-navy'
    linkCls = 'text-claimondo-ondo'
    timeCls = 'text-claimondo-ondo/70'
  } else if (istSv) {
    bubbleCls = 'bg-emerald-50 border border-emerald-200 text-claimondo-navy'
    linkCls = 'text-emerald-700'
    timeCls = 'text-emerald-700/70'
    labelCls = 'text-emerald-700'
  } else if (istMitarbeiter) {
    // Andere Mitarbeiter (z.B. anderer KB im Multi-User, eskalierter Admin)
    bubbleCls = 'bg-claimondo-ondo/12 border border-claimondo-ondo/25 text-claimondo-navy'
    linkCls = 'text-claimondo-navy/80'
    timeCls = 'text-claimondo-navy/50'
    labelCls = 'text-claimondo-ondo'
  } else {
    bubbleCls = 'bg-white border border-claimondo-border text-claimondo-navy'
    linkCls = 'text-claimondo-ondo'
    timeCls = 'text-claimondo-ondo/70'
  }

  // Sender-Label zeigen wenn nicht eigenes Ich — gibt dem Leser den
  // Rollen-Kontext (Kunde / SV / KB).
  const showRolleLabel = !isOwnMsg && !!message.sender_rolle

  return (
    <div className={`flex ${alignRight ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
        alignRight ? 'bg-claimondo-ondo text-white' : 'bg-white border border-claimondo-border text-claimondo-navy'
      }`}>
        {!alignRight && message.sender_rolle && (
          <p className="text-[10px] font-semibold text-claimondo-ondo mb-0.5 uppercase">{message.sender_rolle}</p>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.nachricht}</p>
        {message.hat_anhang && message.anhang_url && (
          <a href={message.anhang_url} target="_blank" rel="noopener noreferrer" className={`text-xs underline mt-1 block ${linkCls}`}>
            Anhang oeffnen
          </a>
        )}
        <p className={`text-[10px] mt-1 ${alignRight ? 'text-white/60' : 'text-claimondo-ondo/70'}`}>
          {new Date(message.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
