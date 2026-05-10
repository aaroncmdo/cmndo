'use client'

// AAR-519 (S2): Chat-UI im Support-Drawer — Messages-Liste + Input + Screenshot-Preview.

import { useEffect, useRef, useState } from 'react'
import { SendIcon, RefreshCwIcon, XCircleIcon, CheckCircle2Icon, ExternalLinkIcon, ImageIcon, Loader2Icon } from 'lucide-react'
import { useSupport } from './SupportContext'
import { useScreenshot } from './useScreenshot'
import { VoiceRecordButton } from './VoiceRecordButton'

export function SupportChat({ userName }: { userName?: string | null }) {
  const { messages, isLoading, error, isClosed, send, reset } = useSupport()
  const { screenshot, capture, clearScreenshot, isCapturing, error: screenshotError } = useScreenshot()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Beim Mount einmal Screenshot ziehen — User darf jederzeit neu aufnehmen.
  // (Aufnahme = "Screenshot aufnehmen", nicht Audio.)
  useEffect(() => {
    capture()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-Scroll bei neuen Nachrichten
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isLoading])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading || isClosed) return
    const text = input
    setInput('')
    // Screenshot nur beim ersten Turn mitgeben — Folge-Antworten brauchen ihn nicht.
    const isFirstTurn = messages.length === 0
    void send(text, isFirstTurn ? screenshot : null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // AAR-520: Transkript wird an bestehenden Text angehängt (nicht ersetzt),
  // User kann dann noch editieren bevor er auf "Senden" klickt.
  function handleTranscript(transcript: string) {
    setInput((prev) => (prev.trim() ? `${prev}\n\n${transcript}` : transcript))
    textareaRef.current?.focus()
  }

  const placeholder = messages.length === 0
    ? `Hi${userName ? ' ' + userName.split(' ')[0] : ''}! Beschreibe das Problem oder den Wunsch…`
    : 'Deine Antwort…'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 && !error && (
          <div className="text-sm text-claimondo-ondo">
            <p className="font-medium text-claimondo-navy mb-1">
              Hi{userName ? ' ' + userName.split(' ')[0] : ''} — was kann ich für dich tun?
            </p>
            <p className="text-xs text-claimondo-ondo">
              Beschreibe das Problem oder den Wunsch — ich prüfe, ob es schon ein Ticket gibt,
              und lege sonst eines für dich an.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-claimondo-navy text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.text}
                  {m.screenshot && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/70">
                      <ImageIcon className="w-3 h-3" /> Screenshot angefügt
                    </div>
                  )}
                </div>
              </div>
            )
          }
          if (m.role === 'assistant') {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] bg-claimondo-bg text-claimondo-navy rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            )
          }
          if (m.role === 'ticket_created' || m.role === 'ticket_commented') {
            const isCreated = m.role === 'ticket_created'
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] w-full bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2Icon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="text-emerald-900 whitespace-pre-wrap">{m.text}</div>
                  </div>
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-900 underline"
                    >
                      {isCreated ? m.identifier : `Kommentar zu ${m.identifier}`} öffnen
                      <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-emerald-800">{isCreated ? m.identifier : `Kommentar zu ${m.identifier}`}</span>
                  )}
                </div>
              </div>
            )
          }
          return null
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-claimondo-bg rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-claimondo-ondo inline-flex items-center gap-2">
              <Loader2Icon className="w-3 h-3 animate-spin" /> Denkt nach…
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
              <XCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="border-t border-claimondo-border px-4 py-2 bg-claimondo-bg">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {isCapturing ? (
                <p className="text-[11px] text-claimondo-ondo inline-flex items-center gap-1">
                  <Loader2Icon className="w-3 h-3 animate-spin" /> Screenshot wird erstellt…
                </p>
              ) : screenshot ? (
                <div className="flex items-center gap-2">
                  <img
                    src={screenshot}
                    alt="Screenshot-Vorschau"
                    className="w-10 h-10 object-cover rounded border border-claimondo-border"
                  />
                  <p className="text-[11px] text-claimondo-ondo truncate">Screenshot angefügt</p>
                </div>
              ) : screenshotError ? (
                <p className="text-[11px] text-amber-700">{screenshotError}</p>
              ) : (
                <p className="text-[11px] text-claimondo-ondo">Kein Screenshot</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={capture}
                disabled={isCapturing}
                className="text-[11px] text-claimondo-ondo hover:text-[#3a6290] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCwIcon className="w-3 h-3" />
                {screenshot ? 'neu' : 'aufnehmen'}
              </button>
              {screenshot && (
                <button
                  type="button"
                  onClick={clearScreenshot}
                  className="text-[11px] text-claimondo-ondo hover:text-red-600"
                >
                  entfernen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-claimondo-border px-3 py-3 bg-white space-y-2"
      >
        {isClosed ? (
          <button
            type="button"
            onClick={reset}
            className="w-full text-sm font-medium px-3 py-2 rounded-lg bg-claimondo-navy text-white hover:bg-[#12265a]"
          >
            Neuen Fall melden
          </button>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={3}
              disabled={isLoading}
              className="w-full resize-none text-sm text-claimondo-navy px-3 py-2 rounded-lg border border-claimondo-border focus:outline-none focus:ring-2 focus:ring-claimondo-ondo focus:border-transparent disabled:bg-claimondo-bg"
            />
            <div className="flex items-end justify-between gap-2">
              <VoiceRecordButton onTranscript={handleTranscript} disabled={isLoading} />
              <div className="flex flex-col items-end gap-1">
                <p className="text-[10px] text-claimondo-ondo/70">Enter zum Senden · Shift+Enter = neue Zeile</p>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-claimondo-navy text-white hover:bg-[#12265a] disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <SendIcon className="w-3.5 h-3.5" /> Senden
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
