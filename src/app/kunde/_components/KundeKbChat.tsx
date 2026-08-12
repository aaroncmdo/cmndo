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
import { useTranslations, useFormatter } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { SendIcon, FileTextIcon, ChevronDownIcon, XIcon, ChevronRightIcon } from 'lucide-react'
import {
  sendKundeChatMessage,
  markKundeChatMessagesRead,
  type KundeChatKanal,
} from './kb-chat-actions'
import { toInitials } from '@/components/shared/KundeAvatar'

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
  claim_nummer: string | null
}

type SenderInfo = {
  name: string
  rolle: 'kb' | 'sv' | 'kunde'
  avatarUrl?: string | null
}

type Props = {
  currentUserId: string
  /** Partner-User-ID — KB beim Direktchat, SV beim Gruppenchat */
  partnerUserId: string
  /** Zusätzliche Sender-IDs die in diesem Channel mitlesen (z.B. KB beim
   *  gruppenchat sendet ebenfalls — ihre Nachrichten sollen sichtbar sein) */
  additionalSenderIds?: string[]
  kanal: KundeChatKanal
  fallOptions: FallOption[]
  /** Default-Fall der vorausgewählt wird (singleFallId). Null = "Allgemein". */
  defaultFallId: string | null
  placeholder?: string
  /** Map user_id → Anzeigename + Rolle. Wird ueber den Bubbles als Label
   *  gerendert, damit klar ist wer geschrieben hat (relevant bei Gruppenchat). */
  senderLabels?: Record<string, SenderInfo>
}

export default function KundeKbChat({
  currentUserId,
  partnerUserId,
  additionalSenderIds = [],
  kanal,
  fallOptions,
  defaultFallId,
  placeholder,
  senderLabels,
}: Props) {
  const t = useTranslations('kunde.shell')
  const format = useFormatter()
  const [messages, setMessages] = useState<Nachricht[]>([])
  const [input, setInput] = useState('')
  const [selectedFallId, setSelectedFallId] = useState<string | null>(defaultFallId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [sendError, setSendError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial-Load + Realtime-Sub
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const validSenders = new Set([currentUserId, partnerUserId, ...additionalSenderIds])

    void supabase
      .from('nachrichten')
      .select('id, fall_id, sender_id, nachricht, gelesen, created_at')
      .eq('kanal', kanal)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as Nachricht[]
        // Newest 500 holen, dann auf chronologische Reihenfolge bringen
        const filtered = rows
          .filter((m) => validSenders.has(m.sender_id ?? ''))
          .reverse()
        setMessages(filtered)
      })

    void markKundeChatMessagesRead(kanal)

    const channel = supabase
      .channel(`kunde-chat-${kanal}-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          filter: `kanal=eq.${kanal}`,
        },
        (payload) => {
          const row = payload.new as Nachricht
          if (!validSenders.has(row.sender_id ?? '')) return
          setMessages((prev) => {
            // Audit-Fix #7: Wenn Server-Action die echte ID schon zurueckgegeben
            // hat (Optimistic wurde via setMessages replace ersetzt), sehen
            // wir die ID hier — skip Realtime-Insert um Duplikat zu vermeiden.
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, row]
          })
          if (row.sender_id !== currentUserId) void markKundeChatMessagesRead(kanal)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, partnerUserId, kanal, additionalSenderIds])

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
    setSendError(null)
    // Optimistisch lokal hinzufuegen — falls Realtime nicht durchkommt
    // (RLS-Edge-Case), zeigt der Kunde die Nachricht trotzdem sofort.
    const optimistic: Nachricht = {
      id: `optimistic-${Date.now()}`,
      fall_id: selectedFallId,
      sender_id: currentUserId,
      nachricht: text,
      gelesen: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    startTransition(async () => {
      const res = await sendKundeChatMessage({
        nachricht: text,
        kanal,
        empfaengerId: partnerUserId,
        fallId: selectedFallId,
      })
      if (!res.ok) {
        // Optimistic entfernen + Input wiederherstellen
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setInput(text)
        setSendError(res.error ?? t('chat.sendFehler'))
        return
      }
      // Audit-Fix #7: Optimistic durch echte DB-ID ersetzen — beim
      // anschliessenden Realtime-Insert dedupt der id-Check sauber.
      if (res.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...m, id: res.messageId! } : m)),
        )
      }
    })
  }

  function fmtTime(iso: string | null) {
    if (!iso) return ''
    return format.dateTime(new Date(iso), { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  }

  function fallNummerOf(id: string | null) {
    if (!id) return null
    return fallOptions.find((f) => f.id === id)?.claim_nummer ?? null
  }

  return (
    <div className="flex flex-col h-full bg-transparent p-2 gap-2 min-h-0">
      {/* Messages — eigener gewrappter Bereich (white-transparent, rounded) */}
      {/* Ops-Test 11.08.: `glass-panel` war eine TOTE Klasse — nirgends in CSS definiert,
          also hatte der Chat gar keine Flaeche und der Text schwebte ueber dem Backdrop.
          Werte = GlassPanel-Variante 'prominent' (shared/GlassPanel.tsx): blickdicht genug,
          um ueber dem navy Backdrop lesbar zu bleiben. */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 rounded-ios-md bg-white/75 backdrop-blur-xl border border-white/60 shadow-ios-lg"
      >
        {messages.length === 0 && (
          <p className="text-center text-xs text-claimondo-ondo/70 mt-8">
            {t('chat.leer')}
          </p>
        )}
        {messages.map((m, idx) => {
          const ownMessage = m.sender_id === currentUserId
          const fallNr = fallNummerOf(m.fall_id)
          const sender = m.sender_id ? senderLabels?.[m.sender_id] : undefined
          // Avatar nur bei der LETZTEN Nachricht einer Sender-Sequenz zeigen
          // (iMessage/WhatsApp-Pattern). Naechste Nachricht vom selben Sender?
          const next = messages[idx + 1]
          const showAvatar =
            !ownMessage && (!next || next.sender_id !== m.sender_id)
          let bubbleCls = ''
          let accentColor = ''
          if (ownMessage) {
            bubbleCls = 'bg-gradient-to-br from-claimondo-navy to-[var(--brand-primary-hover)] text-white rounded-[18px] rounded-br-md shadow-sm'
          } else if (sender?.rolle === 'kb') {
            bubbleCls = 'bg-claimondo-ondo/12 text-claimondo-navy rounded-[18px] rounded-bl-md shadow-sm'
            accentColor = 'var(--brand-secondary, #4573A2)'
          } else if (sender?.rolle === 'sv') {
            // SV-Bubble: success-soft (brand-harmonisiert) statt raw emerald; Avatar bleibt
            // SV-Rollen-Gruen als Rollen-Identitaet (kein Markenton).
            bubbleCls = 'bg-success-soft text-claimondo-navy rounded-[18px] rounded-bl-md shadow-sm'
            accentColor = '#059669'
          } else {
            bubbleCls = 'bg-white text-claimondo-navy rounded-[18px] rounded-bl-md shadow-sm border border-claimondo-border/50'
            accentColor = 'var(--brand-accent, #7BA3CC)'
          }
          const initials = toInitials(sender?.name) || '?'
          return (
            <div key={m.id} className={`flex items-end gap-2 ${ownMessage ? 'justify-end' : 'justify-start'}`}>
              {!ownMessage && (
                <div className={`shrink-0 w-7 h-7 ${showAvatar ? 'visible' : 'invisible'}`}>
                  <div
                    className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {sender?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sender.avatarUrl}
                        alt={sender.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                </div>
              )}
              <div className={`max-w-[78%] px-3.5 py-2 text-sm leading-snug ${bubbleCls}`}>
                {/* WhatsApp-Style Reply-Preview: angelinkter Fall ueber dem
                    Nachrichten-Text. Klick auf den Block fuehrt zur Fallakte. */}
                {fallNr && m.fall_id && (
                  <Link
                    href={`/kunde/faelle/${m.fall_id}`}
                    className={`flex items-center gap-2 rounded-ios-lg px-2 py-1.5 mb-1.5 transition-colors ${
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
                        {t('chat.bezug')}
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

      {/* Composer — eigener gewrappter Bereich, optisch entkoppelt vom
          Nachrichten-Block aber gleicher Stil. Links neben dem Input sitzt
          der runde Claim-Bezug-Picker. */}
      <div className="shrink-0">
        {/* Eingabe-Leiste — gleiche Flaeche wie der Nachrichten-Bereich (s. Kommentar oben). */}
        <div className="rounded-ios-md bg-white/75 backdrop-blur-xl border border-white/60 shadow-ios-lg px-3 pt-2 pb-2">
        {sendError && (
          <p className="text-[11px] text-danger mb-1.5 px-1">{sendError}</p>
        )}
        {/* Fall-Bezug Chip (nur wenn ein Fall ausgewaehlt) — wie WhatsApp-
            Reply-Preview, schwebt direkt ueber dem Input */}
        {selectedFall && (
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-ios-md bg-claimondo-navy/5 border-l-[3px] border-claimondo-navy pl-2 pr-1.5 py-1 text-[11px] text-claimondo-navy">
            <FileTextIcon className="w-3 h-3 text-claimondo-navy/70 shrink-0" />
            <span>{t('chat.bezugPrefix')} <span className="font-mono font-semibold">{selectedFall.claim_nummer ?? selectedFall.id.slice(0, 8)}</span></span>
            <button
              type="button"
              onClick={() => setSelectedFallId(null)}
              className="text-claimondo-navy/40 hover:text-claimondo-navy ml-0.5"
              aria-label={t('chat.bezugEntfernenAria')}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-end gap-2"
        >
          {/* Fall-Bezug-Picker als kleines Plus-Icon links vom Input */}
          {fallOptions.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors ${
                  selectedFall
                    ? 'bg-claimondo-navy/10 text-claimondo-navy hover:bg-claimondo-navy/15'
                    : 'bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-ondo/10'
                }`}
                aria-label={t('chat.bezugWaehlenAria')}
              >
                <FileTextIcon className="w-4 h-4" />
              </button>
              {pickerOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-ios-xl border border-claimondo-border shadow-claimondo-md overflow-hidden z-10">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFallId(null)
                      setPickerOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-claimondo-bg ${
                      selectedFallId === null ? 'bg-claimondo-navy/5 font-semibold' : ''
                    }`}
                  >
                    {t('chat.allgemein')}
                  </button>
                  {fallOptions.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedFallId(f.id)
                        setPickerOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-claimondo-bg border-t border-claimondo-border/30 ${
                        selectedFallId === f.id ? 'bg-claimondo-navy/5 font-semibold' : ''
                      }`}
                    >
                      {f.claim_nummer ?? f.id.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={placeholder ?? t('chat.placeholderDefault')}
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none placeholder:text-claimondo-ondo/50 max-h-32"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-claimondo-navy to-[var(--brand-primary-hover)] hover:from-[var(--brand-primary-hover)] hover:to-claimondo-navy text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            aria-label={t('chat.sendenAria')}
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
        </div>
      </div>
    </div>
  )
}
