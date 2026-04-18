'use client'

// AAR-488 (M6): Chat-Tab fuer Makler-Akte-Detail. Realtime-Gruppenchat
// zwischen Kunde + KB + SV + Makler. Makler-Nachrichten sind fuer alle
// sichtbar. MVP: nutzt bestehenden `gruppenchat`-Kanal.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { InfoIcon, SendIcon, Loader2Icon } from 'lucide-react'
import { maklerSendMessage } from '@/lib/actions/makler-send-message'
import type { MaklerChatMessage } from '@/lib/makler/queries'

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const TIME = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
})

type Props = {
  fallId: string
  currentUserId: string
  initialMessages: MaklerChatMessage[]
}

type Bubble =
  | { kind: 'message'; msg: MaklerChatMessage; pending?: boolean; failed?: boolean }
  | { kind: 'date-separator'; dayKey: string; label: string }

function avatarColor(rolle: string | null, isOwn: boolean): string {
  if (isOwn) return 'bg-amber-500 text-white'
  switch (rolle) {
    case 'kunde':
      return 'bg-emerald-600 text-white'
    case 'kundenbetreuer':
      return 'bg-[#4573A2] text-white'
    case 'sachverstaendiger':
    case 'gutachter':
      return 'bg-violet-600 text-white'
    case 'makler':
      return 'bg-amber-500 text-white'
    case 'system':
      return 'bg-[#0D1B3E] text-white'
    default:
      return 'bg-[#7BA3CC] text-white'
  }
}

function rolleLabel(
  rolle: string | null,
  vorname: string | null,
  nachname: string | null,
  isOwn: boolean,
): string {
  if (isOwn) return 'Sie · Maklerkollege'
  const name = [vorname, nachname].filter(Boolean).join(' ').trim()
  const rolleName =
    rolle === 'kunde'
      ? 'Kunde'
      : rolle === 'kundenbetreuer'
        ? 'Kundenbetreuer'
        : rolle === 'sachverstaendiger' || rolle === 'gutachter'
          ? 'Gutachter'
          : rolle === 'makler'
            ? 'Maklerkollege'
            : rolle === 'system'
              ? 'System'
              : null
  if (name && rolleName) return `${name} · ${rolleName}`
  return name || rolleName || 'Teilnehmer'
}

function initials(vorname: string | null, nachname: string | null): string {
  const v = (vorname ?? '').trim()[0]
  const n = (nachname ?? '').trim()[0]
  return `${v ?? ''}${n ?? ''}`.toUpperCase() || '?'
}

function dayKeyOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function buildBubbles(messages: MaklerChatMessage[]): Bubble[] {
  const out: Bubble[] = []
  let lastDay: string | null = null
  for (const m of messages) {
    const day = dayKeyOf(m.created_at)
    if (day !== lastDay) {
      out.push({
        kind: 'date-separator',
        dayKey: day,
        label: DATE.format(new Date(m.created_at)),
      })
      lastDay = day
    }
    out.push({ kind: 'message', msg: m })
  }
  return out
}

export function MaklerChatTab({ fallId, currentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<MaklerChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  // Initial + nach jeder Nachricht ans Ende scrollen
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Beim Mount: Nachrichten als gelesen markieren (Fire-and-forget).
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('nachrichten')
      .update({ gelesen: true })
      .eq('fall_id', fallId)
      .in('kanal', ['gruppenchat', 'chat_gruppe_mit_makler'])
      .eq('gelesen', false)
      .neq('sender_id', currentUserId)
      .then(() => {
        /* noop */
      })
  }, [fallId, currentUserId])

  // Realtime-Subscription auf neue Nachrichten fuer diesen Fall.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`fall-chat-${fallId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          filter: `fall_id=eq.${fallId}`,
        },
        (payload) => {
          const raw = payload.new as {
            id: string
            fall_id: string
            kanal: string
            nachricht: string
            created_at: string
            sender_id: string | null
            sender_rolle: string | null
            is_system: boolean | null
          }
          if (
            raw.kanal !== 'gruppenchat' &&
            raw.kanal !== 'chat_gruppe_mit_makler'
          ) {
            return
          }
          // Sender-Profil per Query nachladen (Payload enthaelt kein Join).
          void (async () => {
            const { data: prof } = await supabase
              .from('profiles')
              .select('id, vorname, nachname, avatar_url')
              .eq('id', raw.sender_id ?? '')
              .maybeSingle()
            setMessages((prev) => {
              if (prev.some((m) => m.id === raw.id)) return prev
              const next: MaklerChatMessage = {
                id: raw.id,
                fall_id: raw.fall_id,
                kanal: raw.kanal,
                nachricht: raw.nachricht,
                created_at: raw.created_at,
                sender_id: raw.sender_id,
                sender_rolle: raw.sender_rolle,
                is_system: Boolean(raw.is_system),
                sender_vorname: prof?.vorname ?? null,
                sender_nachname: prof?.nachname ?? null,
                sender_avatar_url: prof?.avatar_url ?? null,
              }
              return [...prev, next]
            })
          })()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fallId])

  const bubbles = useMemo(() => buildBubbles(messages), [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setErrorMsg(null)

    const tempId = `temp-${Date.now()}`
    const optimistic: MaklerChatMessage = {
      id: tempId,
      fall_id: fallId,
      kanal: 'gruppenchat',
      nachricht: text,
      created_at: new Date().toISOString(),
      sender_id: currentUserId,
      sender_rolle: 'makler',
      is_system: false,
      sender_vorname: null,
      sender_nachname: null,
      sender_avatar_url: null,
    }
    setMessages((prev) => [...prev, optimistic])
    setPendingIds((prev) => new Set(prev).add(tempId))
    setInput('')

    const res = await maklerSendMessage({ fallId, inhalt: text })

    if (!res.success) {
      // Optimistic-Entry wieder entfernen
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
      setInput(text)
      setErrorMsg(res.error)
    } else {
      // Replace temp durch echten ID (Realtime liefert parallel — Dedup via id)
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: res.messageId } : m)),
      )
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
    }
    setSending(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e7ef] overflow-hidden flex flex-col">
      {/* Info-Banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-[#4573A2]/10 border-b border-[#e4e7ef]">
        <span className="shrink-0 mt-0.5 text-[#0D1B3E]">
          <InfoIcon width={16} height={16} />
        </span>
        <p className="text-xs text-[#0D1B3E] leading-relaxed">
          <span className="font-semibold">Gruppenchat:</span> Sie sehen
          Nachrichten zwischen Kunde, Kundenbetreuer und Gutachter. Ihre
          Nachrichten sind für alle sichtbar.
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto p-4 space-y-3 bg-[#f8f9fb] min-h-[400px] max-h-[60vh]"
      >
        {bubbles.length === 0 ? (
          <div className="h-full flex items-center justify-center py-16">
            <p className="text-sm text-[#4573A2]">
              Noch keine Nachrichten in diesem Fall.
            </p>
          </div>
        ) : (
          bubbles.map((b) =>
            b.kind === 'date-separator' ? (
              <div
                key={`sep-${b.dayKey}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="flex-1 h-px bg-[#e4e7ef]" />
                <span className="text-[11px] text-[#4573A2] px-2">
                  — {b.label} —
                </span>
                <div className="flex-1 h-px bg-[#e4e7ef]" />
              </div>
            ) : (
              <MessageRow
                key={b.msg.id}
                msg={b.msg}
                isOwn={b.msg.sender_id === currentUserId}
                pending={pendingIds.has(b.msg.id)}
              />
            ),
          )
        )}
      </div>

      {/* Error */}
      {errorMsg ? (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      ) : null}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 p-3 border-t border-[#e4e7ef] bg-white"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend(e as unknown as React.FormEvent)
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Nachricht an die Gruppe schreiben …"
          className="flex-1 resize-none rounded-lg border border-[#e4e7ef] bg-white px-3 py-2 text-sm text-[#0D1B3E] placeholder:text-[#7BA3CC] focus:outline-none focus:ring-2 focus:ring-[#4573A2]/40 min-h-[40px] max-h-32"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-lg bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <Loader2Icon width={14} height={14} className="animate-spin" />
          ) : (
            <SendIcon width={14} height={14} />
          )}
          Senden
        </button>
      </form>
    </div>
  )
}

function MessageRow({
  msg,
  isOwn,
  pending,
}: {
  msg: MaklerChatMessage
  isOwn: boolean
  pending?: boolean
}) {
  if (msg.is_system) {
    return (
      <div className="flex justify-center">
        <div className="px-3 py-1.5 rounded-full bg-white border border-[#e4e7ef] text-[11px] text-[#4573A2] max-w-[75%] text-center">
          {msg.nachricht}
          <span className="ml-2 text-[#7BA3CC]">
            {TIME.format(new Date(msg.created_at))}
          </span>
        </div>
      </div>
    )
  }

  const label = rolleLabel(
    msg.sender_rolle,
    msg.sender_vorname,
    msg.sender_nachname,
    isOwn,
  )
  const avCls = avatarColor(msg.sender_rolle ?? null, isOwn)
  const avInit = initials(msg.sender_vorname, msg.sender_nachname)

  return (
    <div
      className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${avCls}`}
        aria-hidden
      >
        {isOwn ? 'S' : avInit}
      </div>
      <div
        className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}
      >
        <span className="text-[11px] text-[#4573A2] mb-0.5 px-1">{label}</span>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-[#0D1B3E] text-white rounded-br-md'
              : 'bg-white text-[#0D1B3E] border border-[#e4e7ef] rounded-bl-md'
          } ${pending ? 'opacity-60' : ''}`}
        >
          {msg.nachricht}
        </div>
        <span className="text-[10px] text-[#7BA3CC] mt-0.5 px-1">
          {TIME.format(new Date(msg.created_at))}
          {pending ? ' · wird gesendet …' : ''}
        </span>
      </div>
    </div>
  )
}
