'use client'

// Live-Termine Phase 3: Supabase Realtime auf sv_kalender_events_cache.
// Wenn der Sync-Cron neue Events schreibt, triggert dieser Hook router.refresh()
// — der SV sieht externe Termine ohne manuellen Page-Reload.

import { useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function KalenderRealtimeRefresh({ svId }: { svId: string }) {
  const router = useRouter()
  const channelId = useId()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`kalender-rt-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sv_kalender_events_cache',
          filter: `sv_id=eq.${svId}`,
        },
        () => router.refresh(),
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [svId, channelId, router])

  return null
}
