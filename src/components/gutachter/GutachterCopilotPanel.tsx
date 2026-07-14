'use client'

// SV-Copilot Panel — Claude-Sonnet-4.6, technisch-fachlich (Kalkulation,
// Wertminderung, Vorschaeden, Nutzungsausfall, Totalschaden/Restwert, BVSK).
// Streaming via /api/gutachter/copilot. Greeting + 4 Suggestion-Chips initial.
//
// TODO(DRY): teilt die Streaming-Chat-Shell (Bubbles/Input/Markdown) mit
// MaklerCopilotTab — bei der naechsten Beruehrung in ein gemeinsames
// <CopilotChat endpoint suggestions greeting/> extrahieren (2 Consumer).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SparklesIcon,
  SendIcon,
  Loader2Icon,
  EuroIcon,
  CarIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  UserIcon,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/primitives'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type Props = {
  fallId: string
}

type SuggestionChip = {
  icon: React.ReactNode
  label: string
  query: string
}

const SUGGESTIONS: SuggestionChip[] = [
  {
    icon: <EuroIcon width={14} height={14} />,
    label: 'Wertminderung ermitteln',
    query:
      'Wie ermittle ich die merkantile Wertminderung für dieses Fahrzeug? Welche Methode passt und welche Faktoren sind hier relevant?',
  },
  {
    icon: <ClipboardCheckIcon width={14} height={14} />,
    label: 'Vorschäden abgrenzen',
    query:
      'Wie grenze ich einen Vorschaden sauber vom aktuellen Schaden ab und wie dokumentiere ich das im Gutachten?',
  },
  {
    icon: <GaugeIcon width={14} height={14} />,
    label: 'Nutzungsausfall-Klasse',
    query:
      'Welche Nutzungsausfall-Klasse und welcher Tagessatz passen für dieses Fahrzeug? Ist eine Herabstufung angebracht?',
  },
  {
    icon: <CarIcon width={14} height={14} />,
    label: 'Reparatur oder Totalschaden?',
    query:
      'Reparatur oder Totalschaden — wie bewerte ich hier die 130%-Grenze technisch und was ist beim Restwert zu beachten?',
  },
]

export function GutachterCopilotPanel({ fallId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const ask = useCallback(
    async (userText: string) => {
      const frage = userText.trim()
      if (!frage || streaming) return
      setErrorMsg(null)

      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: frage }]
      setMessages(nextMessages)
      setInput('')
      setStreaming(true)
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      try {
        const res = await fetch('/api/gutachter/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fallId, messages: nextMessages }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          setErrorMsg(
            res.status === 403
              ? 'Kein Zugriff auf diesen Fall.'
              : `Copilot nicht erreichbar (${res.status}).${text ? ` ${text}` : ''}`,
          )
          setMessages((prev) => prev.slice(0, -1))
          setStreaming(false)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setErrorMsg('Keine Antwort-Stream erhalten.')
          setMessages((prev) => prev.slice(0, -1))
          setStreaming(false)
          return
        }

        const decoder = new TextDecoder()
        let full = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          full += decoder.decode(value, { stream: true })
          setMessages((prev) => {
            const copy = prev.slice()
            copy[copy.length - 1] = { role: 'assistant', content: full }
            return copy
          })
        }
      } catch (err) {
        console.error('[GutachterCopilot] Fetch-Fehler:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Netzwerk-Fehler beim Copilot.')
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setStreaming(false)
      }
    },
    [fallId, messages, streaming],
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void ask(input)
  }

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border bg-gradient-to-br from-claimondo-navy to-claimondo-shield text-white">
        <span className="shrink-0 w-10 h-10 rounded-ios-xl bg-white/10 flex items-center justify-center text-white">
          <SparklesIcon width={20} height={20} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">Gutachter-Copilot</h2>
          <p className="text-xs text-claimondo-light-blue mt-0.5">
            KI-Assistent für die technische Begutachtung — mit Fall-Kontext
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto p-4 space-y-4 bg-claimondo-bg min-h-[360px] max-h-[60vh]"
      >
        {messages.length === 0 ? (
          <div className="space-y-4">
            <AssistantBubble>
              <p>
                Hallo, ich bin dein <strong>Gutachter-Copilot</strong>. Ich kenne
                den Fall — Fahrzeug, Schadenart, Vorschäden und die bereits
                erfassten Gutachten-Werte. Frag mich zur Kalkulation,
                Wertminderung, Nutzungsausfall oder Totalschaden-Bewertung.
              </p>
              <p className="mt-2 text-[13px] text-claimondo-ondo">
                Starte mit einem Vorschlag oder stelle eine eigene Frage. Keine
                Rechtsberatung — das bewertet die Kanzlei.
              </p>
            </AssistantBubble>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-11">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void ask(s.query)}
                  disabled={streaming}
                  className="text-left px-3 py-2.5 rounded-ios-xl border border-claimondo-border bg-white hover:border-claimondo-ondo hover:bg-claimondo-ondo/5 text-sm text-claimondo-navy inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="text-claimondo-ondo">{s.icon}</span>
                  <span className="flex-1">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <MessageRow
            key={i}
            message={m}
            isLastAssistant={streaming && i === messages.length - 1 && m.role === 'assistant'}
          />
        ))}
      </div>

      {errorMsg ? (
        <div className="px-4 py-2 bg-danger-soft border-t border-danger/30 text-xs text-danger-strong">
          {errorMsg}
        </div>
      ) : null}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 p-3 border-t border-claimondo-border bg-white"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(input)
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Frag den Copilot …"
          className="flex-1 resize-none rounded-ios-lg border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-light-blue focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40 min-h-[40px] max-h-32"
          disabled={streaming}
        />
        <Button
          type="submit"
          variant="navy"
          disabled={!input.trim() || streaming}
          className="shrink-0"
          iconLeft={
            streaming ? (
              <Loader2Icon width={14} height={14} className="animate-spin" />
            ) : (
              <SendIcon width={14} height={14} />
            )
          }
        >
          Fragen
        </Button>
      </form>
    </div>
  )
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-8 h-8 rounded-full bg-claimondo-ondo text-white flex items-center justify-center"
        aria-hidden
      >
        <SparklesIcon width={16} height={16} />
      </div>
      <div className="flex-1 max-w-[85%] bg-white border border-claimondo-border rounded-2xl rounded-bl-md px-4 py-3 text-sm text-claimondo-navy leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function MessageRow({
  message,
  isLastAssistant,
}: {
  message: ChatMessage
  isLastAssistant: boolean
}) {
  if (message.role === 'user') {
    return (
      <div className="flex items-start gap-3 flex-row-reverse">
        <div
          className="shrink-0 w-8 h-8 rounded-full bg-claimondo-navy text-white flex items-center justify-center"
          aria-hidden
        >
          <UserIcon width={14} height={14} />
        </div>
        <div className="max-w-[85%] bg-claimondo-navy text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  const empty = message.content.length === 0
  return (
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-8 h-8 rounded-full bg-claimondo-ondo text-white flex items-center justify-center"
        aria-hidden
      >
        <SparklesIcon width={16} height={16} />
      </div>
      <div className="flex-1 max-w-[85%] bg-white border border-claimondo-border rounded-2xl rounded-bl-md px-4 py-3 text-sm text-claimondo-navy leading-relaxed">
        {empty && isLastAssistant ? (
          <span className="inline-flex items-center gap-2 text-claimondo-ondo">
            <Loader2Icon width={14} height={14} className="animate-spin" />
            Copilot denkt nach …
          </span>
        ) : (
          <MarkdownBlock>{message.content}</MarkdownBlock>
        )}
      </div>
    </div>
  )
}

function MarkdownBlock({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-claimondo-navy prose-p:text-claimondo-navy prose-strong:text-claimondo-navy prose-ul:text-claimondo-navy prose-ol:text-claimondo-navy prose-li:my-0.5 prose-p:my-1.5">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
