'use client'

// AAR-724: Generischer Counter-Badge mit Realtime-Refresh.
// Wird für „Neue Termine" (SV), „Neue Rückrufe" (Dispatch) usw. benutzt.
// Pattern: Parent Component übergibt eine async Count-Query + Realtime-Filter;
// dieser Badge kümmert sich um Subscription + State + Rendering.
//
// Rendert nichts wenn der Counter 0 ist — der Konsument kann also einfach
// als Sibling eines Nav-Items eingehängt werden ohne extra-Layout-Fuss.

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type BadgeStyle = 'dot' | 'counter'

export type RealtimeCountBadgeProps = {
  // Async Query, die die aktuelle Anzahl zurückgibt. Muss in einem
  // useCallback-Wrapper kommen, sonst startet useEffect jedes Render neu.
  fetchCount: () => Promise<number>
  // Tabelle auf der auf Inserts/Updates gehört wird.
  realtimeTable: string
  // Initialwert (SSR-Count).
  initialCount?: number
  // 'dot' = nur Punkt, 'counter' = Punkt + Zahl (default)
  variant?: BadgeStyle
  className?: string
}

export default function RealtimeCountBadge({
  fetchCount,
  realtimeTable,
  initialCount = 0,
  variant = 'counter',
  className = '',
}: RealtimeCountBadgeProps) {
  const [count, setCount] = useState<number>(initialCount)
  const channelSuffix = useId()

  useEffect(() => {
    const supabase = createClient()

    let cancelled = false
    async function refresh() {
      try {
        const n = await fetchCount()
        if (!cancelled) setCount(n)
      } catch (err) {
        console.error('[RealtimeCountBadge] fetchCount failed:', err)
      }
    }

    refresh()

    const channel = supabase
      .channel(`rt-count-${realtimeTable}-${channelSuffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: realtimeTable }, () => {
        refresh()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [fetchCount, realtimeTable, channelSuffix])

  if (count <= 0) return null

  if (variant === 'dot') {
    return (
      <span
        aria-label={`${count} neu`}
        className={`inline-block w-2 h-2 rounded-full bg-red-500 ${className}`}
      />
    )
  }

  return (
    <span
      aria-label={`${count} neu`}
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
