'use client'

// Chat-Inbox P2: der EINE Chat-Engine-Hook. Verdrahtet den reinen Reducer
// (src/lib/chat/thread/reducer.ts) mit Supabase: Load, EINE Realtime-Konvention
// (buildChannelName), Dedup, optimistic Send + Rollback, Mark-Read-on-view,
// Unread-Ableitung, Auto-Scroll. Kein Renderer macht das mehr selbst.
//
// fall_id bleibt der Key in P2 (MSG_SELECT ohne claim_id) — der claim_id-Cutover
// ist P3/Track-2.

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatKanal } from '@/lib/communications/channels'
import { chatReducer, type ChatMessage } from '@/lib/chat/thread/reducer'
import { buildThreadFilter, buildChannelName, matchesScope, type ChatScope } from '@/lib/chat/thread/scope'
import type { ChatSender, ChatSendResult } from '@/lib/chat/thread/send-normalize'
import { standardMarkRead } from './mark-read-exec'

const MSG_SELECT =
  'id, fall_id, kanal, sender_id, sender_rolle, nachricht, created_at, gelesen, empfaenger_id, richtung, is_system, hat_anhang, anhang_url'

export type UseChatThreadOpts = {
  scope: ChatScope
  currentUserId: string | null
  send: ChatSender
  /** Standard true: beim Laden + bei eingehenden Nachrichten als gelesen markieren. */
  markReadOnView?: boolean
  /** Mark-Read-Strategie (default standardMarkRead, Browser-Client). */
  markRead?: (scope: ChatScope, userId: string) => Promise<void>
}

export type SendArgs = {
  kanal: ChatKanal
  nachricht: string
  fallId?: string | null
  empfaengerId?: string | null
}

export type UseChatThread = {
  messages: ChatMessage[]
  sendMessage: (args: SendArgs) => Promise<ChatSendResult>
  unreadByKanal: Record<string, number>
  endRef: React.RefObject<HTMLDivElement | null>
  loading: boolean
}

export function useChatThread(opts: UseChatThreadOpts): UseChatThread {
  const { scope, currentUserId, markReadOnView = true } = opts
  const [messages, dispatch] = useReducer(chatReducer, [])
  const [loading, setLoading] = useState(true)
  const instanceId = useId()
  const endRef = useRef<HTMLDivElement | null>(null)
  const tempCounter = useRef(0)

  // send/markRead per Ref halten -> Identitaetswechsel triggert kein Re-Subscribe.
  const sendRef = useRef(opts.send)
  sendRef.current = opts.send
  const markReadRef = useRef(opts.markRead ?? standardMarkRead)
  markReadRef.current = opts.markRead ?? standardMarkRead

  const scopeKey = JSON.stringify(scope)

  // Load + EINE Realtime-Subscription.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const filter = buildThreadFilter(scope)

    ;(async () => {
      setLoading(true)
      let q = supabase
        .from('nachrichten')
        .select(MSG_SELECT)
        .order('created_at', { ascending: true })
        .limit(500)
      if (filter.mode === 'fall') {
        if (filter.fallIds.length === 0) {
          if (!cancelled) {
            dispatch({ type: 'loaded', rows: [] })
            setLoading(false)
          }
          return
        }
        q = q.in('fall_id', filter.fallIds).in('kanal', filter.kanaele)
      } else {
        q = q.eq('kanal', filter.kanal)
      }
      const { data } = await q
      if (cancelled) return
      const rows = ((data ?? []) as ChatMessage[]).filter((r) => matchesScope(r, scope))
      dispatch({ type: 'loaded', rows })
      setLoading(false)
      if (markReadOnView && currentUserId) markReadRef.current(scope, currentUserId).catch(() => {})
    })()

    const channel = supabase
      .channel(buildChannelName(scope, instanceId, currentUserId ?? 'anon'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nachrichten',
          ...(filter.serverFilter ? { filter: filter.serverFilter } : {}),
        },
        (payload) => {
          const row = payload.new as ChatMessage
          if (!matchesScope(row, scope)) return
          dispatch({ type: 'realtimeInsert', row })
          if (markReadOnView && currentUserId && row.sender_id !== currentUserId) {
            markReadRef.current(scope, currentUserId).catch(() => {})
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, currentUserId, markReadOnView, instanceId])

  const sendMessage = useCallback(
    async (args: SendArgs): Promise<ChatSendResult> => {
      const tempId = `temp-${instanceId}-${tempCounter.current++}`
      const fallId = args.fallId ?? (scope.kind === 'fall' ? scope.fallIds[0] ?? null : null)
      const optimistic: ChatMessage = {
        id: tempId,
        fall_id: fallId,
        kanal: args.kanal,
        sender_id: currentUserId,
        nachricht: args.nachricht,
        created_at: new Date().toISOString(),
        gelesen: true,
        richtung: 'outbound',
        pending: true,
      }
      dispatch({ type: 'optimisticAdd', message: optimistic })
      const res = await sendRef.current({
        kanal: args.kanal,
        nachricht: args.nachricht,
        fallId,
        empfaengerId: args.empfaengerId ?? null,
      })
      if (res.ok && res.messageId) dispatch({ type: 'sendResolved', tempId, realId: res.messageId })
      else if (!res.ok) dispatch({ type: 'sendFailed', tempId })
      return res
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey, currentUserId, instanceId],
  )

  const unreadByKanal = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const m of messages) {
      if (!m.gelesen && m.sender_id !== currentUserId) acc[m.kanal] = (acc[m.kanal] ?? 0) + 1
    }
    return acc
  }, [messages, currentUserId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return { messages, sendMessage, unreadByKanal, endRef, loading }
}
