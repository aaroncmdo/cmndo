'use client'

// Direkter Kunde↔Kundenbetreuer-Chat — über alle Fälle hinweg.
// fall_id pro Nachricht optional: ein Fall-Chip-Selector über dem Input
// erlaubt es dem Kunden, eine Frage explizit auf einen Fall zu beziehen
// ("Bezug: CLM-2026..."). Ohne Auswahl = allgemeine Frage (fall_id NULL).
//
// Lädt nachrichten mit kanal='chat_kb_kunde' zwischen Kunde + KB,
// abonniert Realtime auf neue Nachrichten von beiden Seiten.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SendIcon, FileTextIcon, ChevronDownIcon, XIcon, ChevronRightIcon } from 'lucide-react'
import { sendKbKundeMessage, markKbKundeMessagesRead } from './kb-chat-actions'

type Nachricht = {
  id: string
  fall_id: string | null
  sender_id: string | null
  nachricht: string
  gelesen: boolean | null
  created_at: string | null
}

type FallOption = {
  id: string
  fall_nummer: string | null
}

type Props = {
  currentUserId: string
  kbUserId: string
  fallOptions: FallOption[]
  /** Default-Fall der vorausgewählt wird (singleFallId). Null = "Allgemein". */
  defaultFallId: string | null
}

export default function KundeKbChat({ currentUserId, kbUserId, fallOptions, defaultFallId }: Props) {
  const [messages, setMessages] = useState<Nachricht[]>([])
  const [input, setInput] = useState('')
  const [selectedFallId, setSelectedFallId] = useState<string | null>(defaultFallId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial-Load + Realtime-Sub
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    void supabase
      .from('nachrichten')
      .select('id, fall_id, sender_id, nachricht, gelesen, created_at')
      .eq('kanal', 'chat_kb_kunde')
      .or(`sender_id.eq.${currentUserId},sender_id.eq.${kbUserId}`)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as Nachricht[]
        // Nur Nachrichten zwischen kunde und kb (egal welcher fall)
        const filtered = rows.filter((m) => {
          return (
            (m.sender_id === currentUserId) ||
            (m.sender_id === kbUserId)
          )
        })
        setMessages(filtered)
      })

    void markKbKundeMessagesRead()

    const channel = supabase
      .channel(`kb-kunde-chat-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          filter: `kanal=eq.chat_kb_kunde`,
        },
        (payload) => {
          const row = payload.new as Nachricht
          if (row.sender_id !== currentUserId && row.sender_id !== kbUserId) return
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
          if (row.sender_id === kbUserId) void markKbKundeMessagesRead()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, kbUserId])

  // Auto-Scroll bei neuen Nachrichten
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const selectedFall = fallOptions.find((f) => f.id === selectedFallId) ?? null

  function handleSend() {
    const text = input.trim()
    if (!text) return
    startTransition(async () => {
      const res = await sendKbKundeMessage({ nachricht: text, fallId: selectedFallId })
      if (res.ok) setInput('')
      // Nachricht erscheint via Realtime-Sub automatisch
    })
  }

  function fmtTime(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  function fallNummerOf(id: string | null) {
    if (!id) return null
    return fallOptions.find((f) => f.id === id)?.fall_nummer ?? null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-claimondo-ondo/70 mt-8">
            Noch keine Nachrichten. Schreib einfach was — dein Betreuer bekommt
            es direkt.
          </p>
        )}
        {messages.map((m) => {
          const ownMessage = m.sender_id === currentUserId
          const fallNr = fallNummerOf(m.fall_id)
          return (
            <div key={m.id} className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  ownMessage
                    ? 'bg-claimondo-navy text-white rounded-br-sm'
                    : 'bg-white/80 text-claimondo-navy rounded-bl-sm border border-claimondo-border/60'
                }`}
              >
                {/* WhatsApp-Style Reply-Preview: angelinkter Fall ueber dem
                    Nachrichten-Text. Klick auf den Block fuehrt zur Fallakte. */}
                {fallNr && m.fall_id && (
                  <Link
                    href={`/kunde/faelle/${m.fall_id}`}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1.5 transition-colors ${
                      ownMessage
                        ? 'bg-white/10 hover:bg-white/15 border-l-[3px] border-white/40'
                        : 'bg-claimondo-ondo/10 hover:bg-claimondo-ondo/15 border-l-[3px] border-claimondo-ondo'
                    }`}
                  >
                    <FileTextIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        ownMessage ? 'text-white/80' : 'text-claimondo-ondo'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                          ownMessage ? 'text-white/70' : 'text-claimondo-ondo/80'
                        }`}
                      >
                        Bezug
                      </p>
                      <p
                        className={`text-[12px] font-mono font-semibold truncate ${
                          ownMessage ? 'text-white' : 'text-claimondo-navy'
                        }`}
                      >
                        {fallNr}
                      </p>
                    </div>
                    <ChevronRightIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        ownMessage ? 'text-white/60' : 'text-claimondo-ondo/60'
                      }`}
                    />
                  </Link>
                )}
                <p className="whitespace-pre-wrap break-words">{m.nachricht}</p>
                <p
                  className={`text-[9px] mt-1 ${
                    ownMessage ? 'text-white/60 text-right' : 'text-claimondo-ondo/60'
                  }`}
                >
                  {fmtTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Fall-Bezug-Selector (nur wenn mehr als 1 Fall existiert) */}
      {fallOptions.length > 0 && (
        <div className="px-4 py-2 border-t border-claimondo-border/60 bg-white/50">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-claimondo-ondo hover:text-claimondo-navy transition-colors"
            >
              <FileTextIcon className="w-3 h-3" />
              {selectedFall ? (
                <>
                  Bezug: <span className="font-mono font-semibold">{selectedFall.fall_nummer ?? selectedFall.id.slice(0, 8)}</span>
                </>
              ) : (
                'Allgemein (kein Fall-Bezug)'
              )}
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              {selectedFall && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFallId(null)
                  }}
                  className="ml-0.5 text-claimondo-ondo/50 hover:text-claimondo-navy"
                  aria-label="Fall-Bezug entfernen"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </button>
            {pickerOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-claimondo-border shadow-lg overflow-hidden z-10">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFallId(null)
                    setPickerOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#f8f9fb] ${
                    selectedFallId === null ? 'bg-claimondo-navy/5 font-semibold' : ''
                  }`}
                >
                  Allgemein (kein Fall-Bezug)
                </button>
                {fallOptions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelectedFallId(f.id)
                      setPickerOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-[#f8f9fb] border-t border-claimondo-border/30 ${
                      selectedFallId === f.id ? 'bg-claimondo-navy/5 font-semibold' : ''
                    }`}
                  >
                    {f.fall_nummer ?? f.id.slice(0, 8)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-claimondo-border/60 bg-white/60">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Nachricht an deinen Betreuer …"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-claimondo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-navy/30 max-h-32"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-claimondo-navy hover:bg-claimondo-navy/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Senden"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
