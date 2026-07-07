'use client'

// Task 8: Claim-AI-Konsole — interaktiver Admin-Copilot im Fallakten-View.
// Streaming-Chat + „Fall prüfen"-Diagnose + freigabepflichtige Vorschlagskarten.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SparklesIcon, SendIcon, Loader2Icon, CheckIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { freigebenClaimAiVorschlag, verwerfenClaimAiVorschlag, sendeClaimAiEntwurf } from '@/app/faelle/[id]/claim-ai-actions'
import type { ClaimProposalRow } from '@/lib/claim-ai/proposals'
import type { ThreadMessage } from '@/lib/claim-ai/threads'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type Props = {
  fallId: string
  initialProposals: ClaimProposalRow[]
  initialThread: ThreadMessage[]
}

const DIAGNOSE_PROMPT = 'Prüfe diesen Fall auf Probleme und schlage die nötigen Schritte vor.'

const TYP_LABEL: Record<string, string> = {
  task: 'Aufgabe',
  draft_message: 'Nachrichtentwurf',
  add_note: 'Notiz',
  escalation: 'Eskalation',
  next_step: 'Nächster Schritt',
}

function statusLabel(status: string): string {
  switch (status) {
    case 'offen': return 'Offen'
    case 'angenommen': return 'Freigegeben'
    case 'verworfen': return 'Verworfen'
    case 'bearbeitet': return 'Bearbeitet'
    default: return status
  }
}

function ProposalCard({
  proposal,
  fallId,
  onMutate,
}: {
  proposal: ClaimProposalRow
  fallId: string
  onMutate: () => void
}) {
  const [loadingFreigeben, startFreigeben] = useTransition()
  const [loadingVerwerfen, startVerwerfen] = useTransition()
  const [loadingSenden, startSenden] = useTransition()

  const isDraftReady =
    proposal.vorschlag_typ === 'draft_message' &&
    proposal.status === 'angenommen' &&
    !(proposal.ausfuehrung_ergebnis as Record<string, unknown> | null)?.sent_at

  function handleFreigeben() {
    startFreigeben(async () => {
      const r = await freigebenClaimAiVorschlag(proposal.id, fallId)
      if (!r.ok) {
        toast.error(r.error ?? 'Fehler beim Freigeben')
      } else {
        onMutate()
      }
    })
  }

  function handleVerwerfen() {
    startVerwerfen(async () => {
      const r = await verwerfenClaimAiVorschlag(proposal.id, fallId)
      if (!r.ok) {
        toast.error(r.error ?? 'Fehler beim Verwerfen')
      } else {
        onMutate()
      }
    })
  }

  function handleSenden() {
    startSenden(async () => {
      const r = await sendeClaimAiEntwurf(proposal.id, fallId)
      if (!r.ok) {
        toast.error(r.error ?? 'Fehler beim Senden')
      } else {
        onMutate()
      }
    })
  }

  const payloadPreview = (() => {
    const p = proposal.payload as Record<string, unknown>
    if (proposal.vorschlag_typ === 'task') return typeof p.titel === 'string' ? p.titel : null
    if (proposal.vorschlag_typ === 'draft_message') return typeof p.text === 'string' ? String(p.text).slice(0, 120) : null
    if (proposal.vorschlag_typ === 'add_note') return typeof p.titel === 'string' ? p.titel : null
    return null
  })()

  return (
    <div className="border border-claimondo-border rounded-ios-md p-4 bg-claimondo-bg">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-claimondo-navy">
          {TYP_LABEL[proposal.vorschlag_typ] ?? proposal.vorschlag_typ}
        </span>
        <span className="text-caption text-claimondo-ondo/70 shrink-0">
          {statusLabel(proposal.status)}
        </span>
      </div>

      <p className="text-sm text-claimondo-navy mb-1">{proposal.begruendung}</p>

      {payloadPreview ? (
        <p className="text-xs text-claimondo-ondo/80 italic mb-3 line-clamp-2">{payloadPreview}</p>
      ) : null}

      {isDraftReady ? (
        <div className="mt-2 mb-3 rounded-ios-sm border border-claimondo-ondo/30 bg-white p-3">
          <p className="text-body-xs font-medium text-claimondo-ondo mb-1">Entwurf bereit</p>
          <p className="text-sm text-claimondo-navy whitespace-pre-wrap">
            {String((proposal.payload as Record<string, unknown>).text ?? '')}
          </p>
        </div>
      ) : null}

      {proposal.status === 'offen' ? (
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="navy"
            size="sm"
            onClick={handleFreigeben}
            loading={loadingFreigeben}
            iconLeft={<CheckIcon width={13} height={13} />}
          >
            Freigeben
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleVerwerfen}
            loading={loadingVerwerfen}
            iconLeft={<XIcon width={13} height={13} />}
          >
            Verwerfen
          </Button>
        </div>
      ) : null}

      {isDraftReady ? (
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="success"
            size="sm"
            onClick={handleSenden}
            loading={loadingSenden}
            iconLeft={<SendIcon width={13} height={13} />}
          >
            Senden
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function ClaimAiPanel({ fallId, initialProposals, initialThread }: Props) {
  const router = useRouter()

  // Chat-State — hydratiert aus initialThread
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialThread.map((m) => ({ role: m.role, content: m.content })),
  )
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [proposals, setProposals] = useState<ClaimProposalRow[]>(initialProposals)
  const scrollRef = useRef<HTMLDivElement>(null)

  // useState-Initializer laeuft nur einmal — nach router.refresh() liefert das
  // Server-Wrapper-RSC NEUE initialProposals/initialThread als Props. Ohne diesen
  // Sync blieben die Karten nach Freigeben/Verwerfen (und nach dem Copilot-Stream,
  // der neue Vorschlaege persistiert) eingefroren auf dem alten Stand.
  useEffect(() => {
    setProposals(initialProposals)
  }, [initialProposals])

  useEffect(() => {
    setMessages(initialThread.map((m) => ({ role: m.role, content: m.content })))
  }, [initialThread])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  const sendMessage = useCallback(
    async (userText: string, modus: 'chat' | 'diagnose' = 'chat') => {
      const frage = userText.trim()
      if (!frage || streaming) return
      setErrorMsg(null)

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: 'user', content: frage },
      ]
      setMessages(nextMessages)
      setInput('')
      setStreaming(true)

      // Platzhalter-Antwort-Bubble
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      scrollToBottom()

      try {
        const res = await fetch('/api/admin/claim-copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fallId, messages: nextMessages, modus }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          setErrorMsg(
            res.status === 401
              ? 'Kein Zugriff — bitte als Admin einloggen.'
              : `KI-Assistent nicht erreichbar (${res.status}).${text ? ` ${text}` : ''}`,
          )
          setMessages((prev) => prev.slice(0, -1))
          setStreaming(false)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          setErrorMsg('Keine Stream-Antwort erhalten.')
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
          scrollToBottom()
        }

        // Nach Stream: Proposals neu laden (endpoint persistiert via router.refresh)
        router.refresh()
      } catch (err) {
        console.error('[ClaimAiPanel] Fetch-Fehler:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Netzwerk-Fehler beim KI-Assistenten.')
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setStreaming(false)
      }
    },
    [fallId, messages, streaming, scrollToBottom, router],
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void sendMessage(input, 'chat')
  }

  function handleDiagnose() {
    void sendMessage(DIAGNOSE_PROMPT, 'diagnose')
  }

  // Nach Freigabe/Verwerfen router.refresh() aufrufen — Server-Action revalidiert bereits,
  // aber wir aktualisieren auch den lokalen State sofort nicht (refreshed State kommt via router).
  function handleProposalMutated() {
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Copilot-Chat-Panel */}
      <SectionCard
        title="KI-Assistent"
        icon={<SparklesIcon width={16} height={16} className="text-claimondo-ondo" />}
        subtitle="Analysiert den Fall und schlägt freigabepflichtige Aktionen vor"
        headerAction={
          <Button
            variant="ondo"
            size="sm"
            onClick={handleDiagnose}
            loading={streaming}
            iconLeft={<SparklesIcon width={13} height={13} />}
          >
            Fall prüfen
          </Button>
        }
      >
        {/* Nachrichten */}
        <div
          ref={scrollRef}
          className="overflow-y-auto min-h-[200px] max-h-[50vh] space-y-3 mb-3 bg-claimondo-bg rounded-ios-sm p-3"
        >
          {messages.length === 0 ? (
            <p className="text-xs text-claimondo-ondo/60 text-center pt-8">
              Fragen Sie den Assistenten oder nutzen Sie „Fall prüfen" für eine automatische Diagnose.
            </p>
          ) : null}

          {messages.map((m, i) => {
            const isLastAssistant = streaming && i === messages.length - 1 && m.role === 'assistant'
            if (m.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] bg-claimondo-navy text-white rounded-ios-lg rounded-br-none px-3 py-2 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              )
            }
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-claimondo-ondo text-white flex items-center justify-center">
                  <SparklesIcon width={13} height={13} />
                </span>
                <div className="flex-1 max-w-[85%] bg-white border border-claimondo-border rounded-ios-lg rounded-bl-none px-3 py-2 text-sm text-claimondo-navy">
                  {m.content.length === 0 && isLastAssistant ? (
                    <span className="inline-flex items-center gap-2 text-claimondo-ondo">
                      <Loader2Icon width={13} height={13} className="animate-spin" />
                      KI-Assistent denkt nach …
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {errorMsg ? (
          <div className="mb-3 px-3 py-2 rounded-ios-sm bg-danger-soft border border-danger/30 text-xs text-danger-strong">
            {errorMsg}
          </div>
        ) : null}

        {/* Eingabe */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input, 'chat')
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Fragen Sie den Assistenten …"
            disabled={streaming}
            className="flex-1 resize-none rounded-ios-lg border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-light-blue focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40 min-h-[44px] max-h-32"
          />
          <Button
            type="submit"
            variant="navy"
            size="sm"
            disabled={!input.trim() || streaming}
            loading={streaming}
            iconLeft={<SendIcon width={13} height={13} />}
          >
            Senden
          </Button>
        </form>
      </SectionCard>

      {/* Vorschlags-Karten */}
      {proposals.length > 0 ? (
        <SectionCard
          title="KI-Vorschläge"
          subtitle={`${proposals.length} Vorschlag${proposals.length !== 1 ? 'e' : ''} — Admin-Freigabe erforderlich`}
          icon={<SparklesIcon width={16} height={16} className="text-claimondo-ondo" />}
        >
          <div className="space-y-3">
            {proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                fallId={fallId}
                onMutate={handleProposalMutated}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
