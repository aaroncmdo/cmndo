'use client'

// Live-Termine Phase 3: Supabase Realtime auf sv_kalender_events_cache.
// Wenn der Sync-Cron neue Events schreibt, triggert dieser Hook router.refresh()
// — der SV sieht externe Termine ohne manuellen Page-Reload.

import { useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// 2026-07-08: profil-gekeyt. Der Sync-Cron schreibt sv_kalender_events_cache profil-gekeyed
// (profile_id gesetzt, sv_id meist NULL). Der frühere sv_id-Filter matchte die neuen Zeilen nie.
export default function KalenderRealtimeRefresh({ profileId }: { profileId: string }) {
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
          filter: `profile_id=eq.${profileId}`,
        },
        () => router.refresh(),
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [profileId, channelId, router])

  return null
}
