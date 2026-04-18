'use client'

// AAR-519 (S2): State-Container fürs Support-Widget.
// Keine Persistenz — State lebt nur solange der Drawer offen ist.
// Bei `ticket_created`/`commented` wird Input deaktiviert, "Neu starten" reset't.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type SupportMessage =
  | { role: 'user'; text: string; screenshot?: string | null }
  | { role: 'assistant'; text: string }
  | { role: 'ticket_created'; text: string; identifier: string; url: string }
  | { role: 'ticket_commented'; text: string; identifier: string; url: string | null }

type SupportChatResponse =
  | { type: 'question'; message: string; remaining: number }
  | { type: 'text'; message: string; remaining: number }
  | { type: 'commented'; message: string; issueIdentifier: string; commentUrl: string | null; remaining: number }
  | { type: 'created'; message: string; issueIdentifier: string; issueUrl: string; remaining: number }
  | { error: string; message?: string }

export type SupportState = {
  messages: SupportMessage[]
  isLoading: boolean
  error: string | null
  remaining: number | null
  isClosed: boolean
  send: (text: string, screenshotDataUrl: string | null) => Promise<void>
  reset: () => void
}

const SupportCtx = createContext<SupportState | null>(null)

export function SupportProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [isClosed, setIsClosed] = useState(false)

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    setIsClosed(false)
    setRemaining(null)
  }, [])

  const send = useCallback(async (text: string, screenshotDataUrl: string | null) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading || isClosed) return
    setError(null)
    const userMsg: SupportMessage = { role: 'user', text: trimmed, screenshot: screenshotDataUrl }
    const nextMessages: SupportMessage[] = [...messages, userMsg]
    setMessages(nextMessages)
    setIsLoading(true)

    const apiMessages = nextMessages
      .filter((m): m is Extract<SupportMessage, { role: 'user' | 'assistant' }> =>
        m.role === 'user' || m.role === 'assistant',
      )
      .map((m) => ({ role: m.role, content: m.text }))

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          screenshot: screenshotDataUrl,
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as SupportChatResponse

      if (!res.ok) {
        if (res.status === 429) {
          setError(
            'message' in data && data.message
              ? data.message
              : 'Du hast das Stunden-Limit erreicht. Bitte in einer Stunde erneut versuchen.',
          )
        } else if (res.status === 401 || res.status === 403) {
          setError('Deine Session ist abgelaufen. Bitte die Seite neu laden.')
        } else {
          setError(
            'error' in data && data.error
              ? data.error
              : 'Verbindung fehlgeschlagen. Bitte erneut versuchen.',
          )
        }
        return
      }

      if ('error' in data) {
        setError(data.error)
        return
      }

      if (typeof data.remaining === 'number') setRemaining(data.remaining)

      if (data.type === 'question' || data.type === 'text') {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.message }])
      } else if (data.type === 'created') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ticket_created',
            text: data.message,
            identifier: data.issueIdentifier,
            url: data.issueUrl,
          },
        ])
        setIsClosed(true)
      } else if (data.type === 'commented') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ticket_commented',
            text: data.message,
            identifier: data.issueIdentifier,
            url: data.commentUrl,
          },
        ])
        setIsClosed(true)
      }
    } catch (e) {
      console.error('[AAR-519] send fehlgeschlagen:', e)
      setError('Verbindung fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, isClosed])

  const value = useMemo<SupportState>(
    () => ({ messages, isLoading, error, remaining, isClosed, send, reset }),
    [messages, isLoading, error, remaining, isClosed, send, reset],
  )

  return <SupportCtx.Provider value={value}>{children}</SupportCtx.Provider>
}

export function useSupport(): SupportState {
  const ctx = useContext(SupportCtx)
  if (!ctx) throw new Error('useSupport must be used inside <SupportProvider>')
  return ctx
}
