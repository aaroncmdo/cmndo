'use client'

// Geteilte Streaming-Chat-Shell fuer die Rollen-Copiloten (Makler/Gutachter/
// Werkstatt). Kapselt Header, Greeting, Suggestion-Chips, Message-Bubbles,
// Markdown-Rendering, Streaming-Fetch + Fehlerbehandlung. Rollen-Spezifika
// kommen ueber Props (Endpoint, Body-Kontext, Titel, Greeting, Vorschlaege).
// Token-clean (primitives.Card/Button, success/danger-Tokens) — ersetzt die
// zuvor 3x handgerollten (teils raw-gefaerbten) Panels. DRY-Extraktion 2026-07-15.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SparklesIcon, SendIcon, Loader2Icon, UserIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button, Card } from '@/components/primitives'

export type CopilotChatMessage = { role: 'user' | 'assistant'; content: string }

export type CopilotSuggestion = {
  icon: React.ReactNode
  label: string
  query: string
}

export type CopilotChatProps = {
  /** POST-Endpoint der Streaming-Route, z.B. '/api/makler/copilot'. */
  endpoint: string
  /** Statischer Request-Body-Kontext (z.B. { fallId } oder { claimId }); `messages` wird pro Anfrage ergaenzt. */
  body: Record<string, unknown>
  /** Header-Titel. */
  title: string
  /** Header-Untertitel. */
  subtitle: string
  /** Greeting-Bubble-Inhalt (rollen-spezifischer Einstiegstext). */
  greeting: React.ReactNode
  /** Vorschlags-Chips (initial, bis die erste Frage laeuft). */
  suggestions: CopilotSuggestion[]
  /** Optionaler Header-Badge rechts (z.B. "Fall-Kontext geladen"). */
  headerBadge?: React.ReactNode
  /** 403-Fehlertext (Zugriff entzogen/fehlt). */
  accessDeniedText?: string
  /** Input-Placeholder. */
  placeholder?: string
}

export function CopilotChat({
  endpoint,
  body,
  title,
  subtitle,
  greeting,
  suggestions,
  headerBadge,
  accessDeniedText = 'Kein Zugriff auf diesen Fall.',
  placeholder = 'Frag den Copilot …',
}: CopilotChatProps) {
  const [messages, setMessages] = useState<CopilotChatMessage[]>([])
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

      const nextMessages: CopilotChatMessage[] = [...messages, { role: 'user', content: frage }]
      setMessages(nextMessages)
      setInput('')
      setStreaming(true)
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, messages: nextMessages }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          setErrorMsg(
            res.status === 403
              ? accessDeniedText
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
        console.error('[CopilotChat] Fetch-Fehler:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Netzwerk-Fehler beim Copilot.')
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setStreaming(false)
      }
    },
    [endpoint, body, accessDeniedText, messages, streaming],
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void ask(input)
  }

  return (
    <Card p={0} className="overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-claimondo-border bg-gradient-to-br from-claimondo-navy to-claimondo-shield text-white">
        <span className="shrink-0 w-10 h-10 rounded-ios-xl bg-white/10 flex items-center justify-center text-white">
          <SparklesIcon width={20} height={20} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-claimondo-light-blue mt-0.5">{subtitle}</p>
        </div>
        {headerBadge}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto p-4 space-y-4 bg-claimondo-bg min-h-[400px] max-h-[60vh]"
      >
        {messages.length === 0 ? (
          <div className="space-y-4">
            <AssistantBubble>{greeting}</AssistantBubble>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-11">
              {suggestions.map((s) => (
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
          placeholder={placeholder}
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
    </Card>
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
  message: CopilotChatMessage
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
