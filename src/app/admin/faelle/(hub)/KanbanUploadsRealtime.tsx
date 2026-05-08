'use client'

// CMM-33: Live-Aktualisierung der „ungesehene Kunde-Uploads"-Badge im KB-Hub.
// Hört auf Inserts/Updates auf fall_dokumente und löst router.refresh() aus,
// wenn das Event einen unserer Fälle betrifft. Postgres-Filter unterstützt
// kein `IN (...)` — wir filtern client-seitig gegen das Set.

import { useEffect, useId, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  fallIds: string[]
  /** Debounce zwischen mehreren schnellen Events (ms). Default 500. */
  debounceMs?: number
}

export default function KanbanUploadsRealtime({ fallIds, debounceMs = 500 }: Props) {
  const router = useRouter()
  const channelId = useId()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const fallIdSet = useMemo(() => new Set(fallIds), [fallIds])

  useEffect(() => {
    if (fallIdSet.size === 0) return
    const supabase = createClient()

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
        timerRef.current = null
      }, debounceMs)
    }

    function handleEvent(payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) {
      const fid =
        (payload.new?.fall_id as string | undefined) ??
        (payload.old?.fall_id as string | undefined)
      if (!fid || !fallIdSet.has(fid)) return
      scheduleRefresh()
    }

    const channel = supabase
      .channel(`kanban-uploads-${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fall_dokumente' },
        handleEvent,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fall_dokumente' },
        handleEvent,
      )
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [fallIdSet, channelId, router, debounceMs])

  return null
}
