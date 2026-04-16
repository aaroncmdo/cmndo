'use client'

// AAR-319: FAQ-Bot-Card im Kundenportal. Chat-Interface für Fragen zum
// eigenen Fall — kennt Fallstatus, Termin, Prozess.

import { useState, useTransition, useRef, useEffect } from 'react'
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
  const [pending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history])

  function ask(text: string) {
    if (!text.trim() || pending) return
    setError(null)
    startTransition(async () => {
      const r = await askKundenFaq(fallId, text)
      if (!r.success) {
        setError(r.error)
        return
      }
      setHistory(r.history)
      setFrage('')
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-[#4573A2]" />
        <h3 className="text-sm font-semibold text-gray-900">Fragen zu Ihrem Fall</h3>
      </div>
      <p className="text-xs text-gray-500">
        Unser Assistent kennt Ihren aktuellen Fall und beantwortet häufige Fragen
        auf Basis Ihrer Daten. Bei komplexen Anliegen meldet sich Ihr
        Kundenbetreuer.
      </p>

      {history.length === 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">Beispielfragen</p>
          <div className="flex flex-wrap gap-1.5">
            {BEISPIEL_FRAGEN.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => ask(f)}
                disabled={pending}
                className="px-2.5 py-1 rounded-full text-[11px] bg-white border border-gray-200 text-gray-700 hover:bg-[#4573A2] hover:text-white hover:border-[#4573A2] disabled:opacity-50"
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
          className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 max-h-[400px] overflow-y-auto"
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
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                } whitespace-pre-wrap`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-[#4573A2] text-white flex items-center justify-center">
                <LoaderIcon className="w-4 h-4 animate-spin" />
              </div>
              <div className="rounded-2xl px-3 py-2 text-sm bg-white border border-gray-200 text-gray-500 italic">
                Claimondo-Assistent denkt nach …
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
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#4573A2] disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={pending || !frage.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#4573A2] text-white text-sm font-medium hover:bg-[#0D1B3E] disabled:opacity-40 disabled:cursor-not-allowed"
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
