'use client'

// AAR-319: FAQ-Bot-Card im Kundenportal. Chat-Interface für Fragen zum
// eigenen Fall — kennt Fallstatus, Termin, Prozess.
// AAR-435: Streaming via /api/faq-bot/ask (ReadableStream). Server-Action
// askKundenFaq bleibt als Fallback.

import { useState, useRef, useEffect } from 'react'
import { SparklesIcon, SendIcon, LoaderIcon, UserIcon, BotIcon } from 'lucide-react'
import { askKundenFaq } from '../faq-bot-actions'
import type { ChatMessage } from '@/lib/faq-bot/ask'

const BEISPIEL_FRAGEN = [
  'Wann kommt mein Geld?',
  'Muss ich irgendwas bezahlen?',
  'Wie läuft der Termin mit dem Gutachter?',
  'Was bedeutet Sicherungsabtretung?',
]

export function FaqBotCard({
  fallId,
  initialHistory,
}: {
  fallId: string
  initialHistory: ChatMessage[]
}) {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory)
  const [frage, setFrage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // AAR-435: Teilweise gestreamter Token-Text der Assistant-Antwort.
  const [streamingText, setStreamingText] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history, streamingText])

  async function ask(text: string) {
    if (!text.trim() || pending) return
    setError(null)
    setPending(true)
    setStreamingText('')

    const trimmed = text.trim()
    const optimisticUserMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      ts: new Date().toISOString(),
    }
    const baseHistory = [...history, optimisticUserMsg]
    setHistory(baseHistory)

    try {
      const response = await fetch('/api/faq-bot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallId, frage: trimmed }),
      })

      if (!response.ok || !response.body) {
        // AAR-435: Fallback auf Server-Action
        const r = await askKundenFaq(fallId, trimmed)
        if (!r.success) {
          setError(r.error)
          // Optimistisches User-Msg wieder entfernen
          setHistory(history)
        } else {
          setHistory(r.history)
          setFrage('')
        }
        setPending(false)
        setStreamingText('')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamingText(accumulated)
      }

      // Server hat die Historie selbst persistiert. Wir merged im Client
      // die finale Assistant-Nachricht rein, damit das UI sofort stabil ist.
      const finalHistory: ChatMessage[] = [
        ...baseHistory,
        { role: 'assistant', content: accumulated, ts: new Date().toISOString() },
      ]
      setHistory(finalHistory)
      setStreamingText('')
      setFrage('')
    } catch (err) {
      console.error('[AAR-435] Stream-Lesen fehlgeschlagen, Fallback auf Server-Action:', err)
      try {
        const r = await askKundenFaq(fallId, trimmed)
        if (!r.success) {
          setError(r.error)
          setHistory(history)
        } else {
          setHistory(r.history)
          setFrage('')
        }
      } catch (err2) {
        setError(err2 instanceof Error ? err2.message : 'Anfrage fehlgeschlagen')
        setHistory(history)
      }
      setStreamingText('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-[#4573A2]" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Fragen zu Ihrem Fall</h3>
      </div>
      <p className="text-xs text-claimondo-ondo">
        Unser Assistent kennt Ihren aktuellen Fall und beantwortet häufige Fragen
        auf Basis Ihrer Daten. Bei komplexen Anliegen meldet sich Ihr
        Kundenbetreuer.
      </p>

      {history.length === 0 && (
        <div className="rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70">Beispielfragen</p>
          {/* AAR-452: min-h-[36px] + px-3 für tappable Chips auf Mobile */}
          <div className="flex flex-wrap gap-1.5">
            {BEISPIEL_FRAGEN.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => ask(f)}
                disabled={pending}
                className="inline-flex items-center px-3 min-h-[36px] rounded-full text-xs bg-white border border-claimondo-border text-claimondo-navy hover:bg-[#4573A2] hover:text-white hover:border-[#4573A2] disabled:opacity-50"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div
          ref={scrollRef}
          className="rounded-lg border border-claimondo-border bg-[#f8f9fb] p-3 space-y-3 max-h-[400px] overflow-y-auto"
        >
          {history.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#4573A2] text-white flex items-center justify-center shrink-0">
                  <BotIcon className="w-4 h-4" />
                </div>
              )}
              <div
                className={`rounded-2xl px-3 py-2 text-sm max-w-[80%] ${
                  m.role === 'user'
                    ? 'bg-[#4573A2] text-white rounded-tr-sm'
                    : 'bg-white border border-claimondo-border text-claimondo-navy rounded-tl-sm'
                } whitespace-pre-wrap`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-claimondo-border text-claimondo-ondo flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-[#4573A2] text-white flex items-center justify-center shrink-0">
                {streamingText ? <BotIcon className="w-4 h-4" /> : <LoaderIcon className="w-4 h-4 animate-spin" />}
              </div>
              <div
                className={`rounded-2xl px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${
                  streamingText
                    ? 'bg-white border border-claimondo-border text-claimondo-navy rounded-tl-sm'
                    : 'bg-white border border-claimondo-border text-claimondo-ondo italic'
                }`}
              >
                {streamingText || 'Claimondo-Assistent denkt nach …'}
              </div>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(frage)
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          disabled={pending}
          maxLength={2000}
          placeholder="Ihre Frage …"
          // AAR-452: text-base (iOS-Zoom-Fix) + min-h-[44px]
          className="flex-1 text-base rounded-lg border border-claimondo-border px-3 min-h-[44px] outline-none focus:border-[#4573A2] disabled:bg-[#f8f9fb]"
        />
        <button
          type="submit"
          disabled={pending || !frage.trim()}
          className="inline-flex items-center gap-1 px-4 min-h-[44px] rounded-lg bg-[#4573A2] text-white text-sm font-medium hover:bg-[#0D1B3E] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
        </button>
      </form>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </p>
      )}
    </div>
  )
}
