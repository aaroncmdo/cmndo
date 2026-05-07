'use client'

// AAR-383: Fokus-Chat-Panel für den Feldmodus.
// Minimal-invasive Eigenimplementierung (kein MultiChannelChat-Wrapping),
// weil Fokus-Chat nur einen Kanal (chat_kunde_sv) nutzt und die UI-
// Anforderungen (Bottom-Sheet, Quick-Reply-Pills, kompakt) strukturell
// anders sind als der Multi-Tab-Chat in der Fallakte.
//
// Zwei States (MVP): Collapsed (60px Strip) / Full (90% Höhe). Half-State
// und Swipe-Gesten bewusst geschnitten — Tap-Toggle reicht für MVP.
// Auto-Collapse bei sessionStatus='arrived' (Fallakten-View braucht Platz).

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ChevronUpIcon,
  MessageCircleIcon,
  SendIcon,
  XIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendChatMessage } from '@/lib/communications/send-chat'
import {
  getQuickReplies,
  type QuickReplyContext,
} from '@/lib/sv/quick-replies'
import type { SessionStatus } from '@/lib/types/field-modus'

interface Nachricht {
  id: string
  sender_id: string | null
  nachricht: string
  richtung: string | null
  created_at: string
  gelesen: boolean | null
}

interface Props {
  fallId: string
  sessionStatus: SessionStatus
  etaMinutes: number | null
  terminAddress: string
  customerName: string
  fehlendeDokumente?: string[]
  /** Aktuelle SV-User-ID — für outbound/inbound-Unterscheidung im UI. */
  currentUserId: string | null
  /** Empfänger-ID (lead.user_id oder ähnlich), optional — sendChatMessage
   *  kommt ohne aus wenn null. */
  empfaengerId?: string | null
}

const KANAL = 'chat_kunde_sv' as const

export default function FokusChatPanel({
  fallId,
  sessionStatus,
  etaMinutes,
  terminAddress,
  customerName,
  fehlendeDokumente,
  currentUserId,
  empfaengerId,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  // useId-Suffix gegen Strict-Mode-Doppel-Mount-Crash (Memory
  // feedback_realtime_channel_ids).
  const channelSuffix = useId()
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Nachricht[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [input, setInput] = useState('')
  const [sending, startSending] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial-Load + Realtime-Subscription auf nachrichten.
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('nachrichten')
      .select('id, sender_id, nachricht, richtung, created_at, gelesen')
      .eq('fall_id', fallId)
      .eq('kanal', KANAL)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return
        setMessages(data as Nachricht[])
      })

    const channel = supabase
      .channel(`fokus-chat-${fallId}-${channelSuffix}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          filter: `fall_id=eq.${fallId}`,
        },
        (payload) => {
          const row = payload.new as Nachricht & { kanal: string }
          if (row.kanal !== KANAL) return
          setMessages((prev) => [...prev, row])
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [supabase, fallId, channelSuffix])

  // Ungelesene zählen (inbound + nicht-gelesen + nicht eigene).
  useEffect(() => {
    const n = messages.filter(
      (m) =>
        !m.gelesen &&
        m.richtung === 'inbound' &&
        m.sender_id !== currentUserId,
    ).length
    setUnreadCount(n)
  }, [messages, currentUserId])

  // Auto-Collapse beim Ankunfts-State (Fallakte braucht den Bildschirm).
  useEffect(() => {
    if (sessionStatus === 'arrived') setExpanded(false)
  }, [sessionStatus])

  // Auto-Scroll wenn expanded und neue Nachricht kommt.
  useEffect(() => {
    if (!expanded) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [expanded, messages])

  const quickReplies = useMemo<ReturnType<typeof getQuickReplies>>(() => {
    const ctx: QuickReplyContext = {
      sessionStatus,
      etaMinutes,
      terminAddress,
      customerName,
      fehlendeDokumente,
    }
    return getQuickReplies(ctx)
  }, [
    sessionStatus,
    etaMinutes,
    terminAddress,
    customerName,
    fehlendeDokumente,
  ])

  const doSend = (text: string) => {
    if (!text.trim() || sending) return
    startSending(async () => {
      const res = await sendChatMessage({
        fallId,
        kanal: KANAL,
        nachricht: text.trim(),
        empfaengerId: empfaengerId ?? null,
      })
      if (!res.success) {
        toast.error(res.error ?? 'Senden fehlgeschlagen')
        return
      }
      setInput('')
      // 3-Sek-Undo-Toast: löscht die zuletzt gesendete outbound-Nachricht
      // wenn der User innerhalb von 3s auf Undo klickt.
      toast.success('Nachricht gesendet', {
        action: {
          label: 'Rückgängig',
          onClick: async () => {
            const { data: recent } = await supabase
              .from('nachrichten')
              .select('id, created_at')
              .eq('fall_id', fallId)
              .eq('kanal', KANAL)
              .eq('sender_id', currentUserId ?? '')
              .order('created_at', { ascending: false })
              .limit(1)
            const last = recent?.[0]
            if (!last) return
            // Nur innerhalb 10s rückgängig erlaubt (Sicherheit)
            const age =
              Date.now() - new Date(last.created_at as string).getTime()
            if (age > 10_000) {
              toast.error('Nachricht zu alt zum Löschen')
              return
            }
            await supabase
              .from('nachrichten')
              .delete()
              .eq('id', last.id as string)
            setMessages((prev) => prev.filter((m) => m.id !== last.id))
            toast.success('Nachricht zurückgenommen')
          },
        },
        duration: 3000,
      })
    })
  }

  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.richtung === 'inbound')

  if (!expanded) {
    // 2026-05-07 Polish: kollabierter Chat-Pill ist jetzt auch eine Glass-
    // Floating-Card analog zu FokusHeader/AktuellerStopCard. Mobile bleibt
    // full-width Bottom-Bar (Mobile-UX), Desktop ist eine Pill bottom-left
    // mit Glass-Tokens.
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed z-40 px-3 py-2 flex items-center gap-3 bg-white/65 backdrop-blur-md border border-white/40 shadow-ios-md hover:bg-white/80 transition-colors
          bottom-0 left-0 right-0 border-t border-l-0 border-r-0 border-b-0 rounded-t-2xl
          lg:bottom-4 lg:left-4 lg:right-auto lg:w-[380px] lg:rounded-2xl lg:border"
        aria-label="Chat öffnen"
      >
        <div className="relative">
          <MessageCircleIcon className="w-5 h-5 text-claimondo-ondo" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo leading-tight">
            Chat mit {customerName || 'Kunde'}
          </p>
          <p className="text-xs text-claimondo-navy truncate">
            {lastInbound
              ? lastInbound.nachricht
              : 'Tippen zum Öffnen · Quick-Replies verfügbar'}
          </p>
        </div>
        <ChevronUpIcon className="w-4 h-4 text-claimondo-ondo/70" />
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[10vh] z-40 bg-white border-t border-[var(--brand-primary)]/20 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-claimondo-border flex items-center gap-2">
        <MessageCircleIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Chat · {customerName || 'Kunde'}
          </p>
          <p className="text-xs text-claimondo-ondo">Direkt-Chat mit dem Kunden</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="p-1.5 rounded-lg hover:bg-claimondo-bg text-claimondo-ondo"
          aria-label="Chat schließen"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-claimondo-bg"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-claimondo-ondo/70 italic text-center mt-8">
            Noch keine Nachrichten. Tippen Sie eine Quick-Reply oder
            schreiben Sie eigene Nachricht.
          </p>
        ) : (
          messages.map((m) => {
            const isOwn =
              m.richtung === 'outbound' || m.sender_id === currentUserId
            return (
              <div
                key={m.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    isOwn
                      ? 'bg-[var(--brand-secondary)] text-white rounded-br-sm'
                      : 'bg-white border border-claimondo-border text-[var(--brand-primary)] rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.nachricht}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Quick-Reply-Pills */}
      <div className="px-3 py-2 border-t border-claimondo-border overflow-x-auto whitespace-nowrap flex gap-2 scroll-smooth">
        {quickReplies.map((qr) => (
          <button
            key={qr.id}
            type="button"
            onClick={() => doSend(qr.resolvedText)}
            disabled={sending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--brand-secondary)]/10 hover:bg-[var(--brand-secondary)]/20 text-[var(--brand-primary)] text-xs font-medium disabled:opacity-50 flex-shrink-0"
          >
            <span>{qr.emoji}</span>
            {qr.label}
          </button>
        ))}
      </div>

      {/* Text-Input */}
      <div className="px-3 py-2 border-t border-claimondo-border bg-white flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              doSend(input)
            }
          }}
          placeholder="Eigene Nachricht tippen…"
          className="flex-1 min-h-[44px] text-base rounded-lg border border-claimondo-border px-3 focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]"
        />
        <button
          type="button"
          onClick={() => doSend(input)}
          disabled={sending || !input.trim()}
          className="p-2.5 rounded-lg bg-[var(--brand-primary)] hover:bg-[#1A2A55] text-white disabled:opacity-50"
          aria-label="Senden"
        >
          {sending ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
