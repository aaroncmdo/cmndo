'use client'

// Werkstatt-Chat: geteilter Fall-Gruppenchat (v2-Thread `kunde_gruppe` + v1-Kanal
// 'gruppenchat', analog Makler #4349). Send schreibt in den Thread (Kunde/KB/SV
// sehen die Werkstatt), Read = Union v1∪Thread, Realtime = 2 Subs (fall_id + thread_id,
// best-effort — Werkstatt-Live-Empfang Eingehender ist RLS-blockiert, s.u.).

import { useState, useRef, useEffect, useCallback } from 'react'
import { SendIcon, Loader2Icon, InfoIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { createClient } from '@/lib/supabase/client'
import { werkstattSendMessage } from '@/lib/actions/werkstatt-send-message'
import type { WerkstattChatMessage } from '@/lib/werkstatt/queries'

const ROLLE_LABEL: Record<string, string> = {
  kunde: 'Kunde',
  kundenbetreuer: 'Betreuer',
  sachverstaendiger: 'Gutachter',
  gutachter: 'Gutachter',
  makler: 'Makler',
  werkstatt: 'Werkstatt',
  system: 'System',
}

type LocalMessage = WerkstattChatMessage & { pending?: boolean }

export function WerkstattChatTab({
  claimId,
  fallId,
  gruppeThreadId,
  currentUserId,
  initialMessages,
}: {
  claimId: string
  fallId: string
  gruppeThreadId: string | null
  currentUserId: string | null
  initialMessages: WerkstattChatMessage[]
}) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Realtime (analog MaklerChatTab / #4349, best-effort): neue Nachrichten des Falls.
  // v1-Kanal `gruppenchat` via fall_id-Filter (Legacy); v2-`kunde_gruppe`-Thread via
  // thread_id-Filter (Kunde/KB/SV tragen kein kanal='gruppenchat', kommen NUR ueber den
  // Thread rein). Eigene Werkstatt-Zeilen laufen ueber die optimistic-Anzeige -> in
  // addFromRow uebersprungen (kein Echo-Dup). Der Werkstatt-Live-Empfang EINGEHENDER
  // Kunde/KB/SV-Zeilen ist RLS-blockiert (keine Werkstatt-nachrichten-SELECT-Policy) ->
  // die thread_id-Sub liefert fuer die Werkstatt aktuell nichts = harmloser No-op;
  // Eingehende erscheinen per Reload (getWerkstattFallChat via Admin). Aktiviert sich
  // automatisch, falls je eine Werkstatt-SELECT-Policy dazukommt (wie beim Makler).
  useEffect(() => {
    const supabase = createClient()
    type RawRow = {
      id: string
      kanal: string | null
      nachricht: string
      created_at: string
      sender_id: string | null
      sender_rolle: string | null
      is_system: boolean | null
    }
    const addFromRow = (raw: RawRow) => {
      if (raw.sender_id && raw.sender_id === currentUserId) return // eigene via optimistic
      void (async () => {
        const { data: prof } = await supabase
          .from('profiles')
          .select('vorname, nachname')
          .eq('id', raw.sender_id ?? '')
          .maybeSingle()
        setMessages((prev) => {
          if (prev.some((m) => m.id === raw.id)) return prev
          const next: LocalMessage = {
            id: raw.id,
            nachricht: raw.nachricht,
            created_at: raw.created_at,
            sender_id: raw.sender_id,
            sender_rolle: raw.sender_rolle,
            is_system: Boolean(raw.is_system),
            sender_vorname: (prof?.vorname as string | null) ?? null,
            sender_nachname: (prof?.nachname as string | null) ?? null,
          }
          return [...prev, next]
        })
      })()
    }
    let channel = supabase.channel(`werkstatt-chat-${claimId}`).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'nachrichten', filter: `fall_id=eq.${fallId}` },
      (payload) => {
        const raw = payload.new as RawRow
        if (raw.kanal !== 'gruppenchat') return
        addFromRow(raw)
      },
    )
    if (gruppeThreadId) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          filter: `thread_id=eq.${gruppeThreadId}`,
        },
        (payload) => addFromRow(payload.new as RawRow),
      )
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [claimId, fallId, gruppeThreadId, currentUserId])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setErrorMsg(null)
    setSending(true)
    const tempId = `temp-${messages.length}-${text.length}`
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        nachricht: text,
        created_at: '',
        sender_id: currentUserId,
        sender_rolle: 'werkstatt',
        is_system: false,
        sender_vorname: null,
        sender_nachname: null,
        pending: true,
      },
    ])
    setInput('')
    const res = await werkstattSendMessage({ claimId, inhalt: text })
    setSending(false)
    if (!res.success) {
      setErrorMsg(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      return
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, id: res.messageId, pending: false } : m)),
    )
  }, [input, sending, messages.length, currentUserId, claimId])

  return (
    <SectionCard title="Nachrichten" className="mt-3">
      <p className="text-body-xs text-claimondo-ondo mb-2 inline-flex items-center gap-1">
        <InfoIcon width={12} height={12} /> Gruppenchat mit Claimondo, Kunde &amp; Gutachter.
      </p>
      <div
        ref={scrollRef}
        className="max-h-[50vh] overflow-y-auto space-y-2 rounded-ios-md bg-claimondo-bg p-3"
      >
        {messages.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo text-center py-6">
            Noch keine Nachrichten in diesem Auftrag.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id != null && m.sender_id === currentUserId
            const name =
              [m.sender_vorname, m.sender_nachname].filter(Boolean).join(' ') ||
              ROLLE_LABEL[m.sender_rolle ?? ''] ||
              'Teilnehmer'
            return (
              <div
                key={m.id}
                className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}
              >
                <span className="text-body-xs text-claimondo-ondo px-1">
                  {name}
                  {!mine && m.sender_rolle && ROLLE_LABEL[m.sender_rolle]
                    ? ` · ${ROLLE_LABEL[m.sender_rolle]}`
                    : ''}
                </span>
                <div
                  className={
                    mine
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-claimondo-navy text-white px-3 py-2 text-body-sm whitespace-pre-wrap'
                      : 'max-w-[85%] rounded-2xl rounded-bl-md bg-white border border-claimondo-border text-claimondo-navy px-3 py-2 text-body-sm whitespace-pre-wrap'
                  }
                >
                  {m.nachricht}
                  {m.pending && <span className="ml-1 opacity-60">…</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {errorMsg && <p className="text-body-xs text-danger-strong mt-2">{errorMsg}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex items-end gap-2 mt-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Nachricht an die Gruppe schreiben …"
          className="flex-1 resize-none rounded-ios-lg border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy placeholder:text-claimondo-light-blue focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40 min-h-[40px] max-h-32"
          disabled={sending}
        />
        <Button
          type="submit"
          variant="navy"
          size="sm"
          disabled={!input.trim() || sending}
          className="shrink-0"
          iconLeft={
            sending ? (
              <Loader2Icon width={14} height={14} className="animate-spin" />
            ) : (
              <SendIcon width={14} height={14} />
            )
          }
        >
          Senden
        </Button>
      </form>
    </SectionCard>
  )
}
