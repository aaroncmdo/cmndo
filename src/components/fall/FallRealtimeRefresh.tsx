'use client'

// AAR-864: Live-Aktualisierung für Fall-Detail-Pages.
// Abonniert gutachter_termine + auftraege auf Änderungen für einen
// bestimmten fall_id und ruft router.refresh() — die Server-Page rendert
// dann mit force-dynamic neu, alle Verlegungs-/Termin-/Phasen-Banner
// reflektieren den frischen DB-State ohne dass der User refreshen muss.
//
// Nutzbar in beiden Portalen: /kunde/faelle/[id] und /gutachter/fall/[id].

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  fallId: string
  /** Optional: claim_id, damit Aenderungen am Claim (OCR-Felder, Phase, Status,
   *  No-Show-Counter) ebenfalls einen Refresh ausloesen. */
  claimId?: string | null
  /** Optional: Debounce zwischen mehreren schnellen Events (ms). Default 500. */
  debounceMs?: number
}

export default function FallRealtimeRefresh({ fallId, claimId, debounceMs = 500 }: Props) {
  const router = useRouter()
  const channelId = useId()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!fallId) return
    const supabase = createClient()

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
        timerRef.current = null
      }, debounceMs)
    }

    const channel = supabase
      .channel(`fall-rt-${fallId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `fall_id=eq.${fallId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auftraege',
          filter: `fall_id=eq.${fallId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'faelle',
          filter: `id=eq.${fallId}`,
        },
        scheduleRefresh,
      )

    if (claimId) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'claims',
          filter: `id=eq.${claimId}`,
        },
        scheduleRefresh,
      )
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kanzlei_faelle',
          filter: `claim_id=eq.${claimId}`,
        },
        scheduleRefresh,
      )
    }

    channel.subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [fallId, claimId, channelId, router, debounceMs])

  return null
}
