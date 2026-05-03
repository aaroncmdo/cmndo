'use client'

// K1-Konsolidierung: Zentraler Realtime-Counter-Hook.
//
// Vorher: TasksPill, RealtimeCountBadge und GutachterShell.loadBadges
// hatten jeweils eigene Implementierungen von „zähle X, refresh on
// realtime-Änderung, cleanup bei unmount". Mit diesem Hook bleibt nur
// noch die Query-Logik pro Consumer individuell — Subscription + State
// + initialCount-Handling ist einheitlich.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type UseRealtimeCountOptions = {
  /** Async Query, die die aktuelle Anzahl zurückgibt. */
  fetchCount: () => Promise<number>
  /** Tabelle auf der auf Inserts/Updates/Deletes gehört wird. */
  table: string
  /** Initialwert (SSR-seitig geladen). Nur relevant bis der erste Refresh fertig ist. */
  initialCount?: number
  /** Default-Event ist '*'. Consumer können eingrenzen falls nötig. */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
}

export function useRealtimeCount({
  fetchCount,
  table,
  initialCount = 0,
  event = '*',
}: UseRealtimeCountOptions) {
  const [count, setCount] = useState<number>(initialCount)
  const channelSuffix = useId()
  // Cancelled-Ref verhindert, dass späte fetchCount-Responses den Counter
  // nach Unmount überschreiben.
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const n = await fetchCount()
      if (!cancelledRef.current) setCount(n)
    } catch (err) {
      console.error('[useRealtimeCount] fetchCount failed:', err)
    }
  }, [fetchCount])

  useEffect(() => {
    cancelledRef.current = false
    const supabase = createClient()

    refresh()

    const channel = supabase
      .channel(`rt-count-${table}-${channelSuffix}`)
      .on('postgres_changes', { event, schema: 'public', table }, () => refresh())
      .subscribe()

    return () => {
      cancelledRef.current = true
      supabase.removeChannel(channel)
    }
  }, [refresh, table, event, channelSuffix])

  return { count, refresh }
}
