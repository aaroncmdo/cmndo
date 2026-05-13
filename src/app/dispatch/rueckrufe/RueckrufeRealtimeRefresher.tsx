'use client'

// Realtime-Refresher für /dispatch/rueckrufe. Server-Component lädt die initiale
// Liste, dieser Client-Sidekick abonniert admin_termine + leads + triggert
// router.refresh() bei jedem relevanten Event. Damit sieht der Dispatcher neu
// eingehende Rückrufe (z.B. aus dem Beratungs-Modal) live ohne manuellen Reload.
//
// Pattern: useId() im channel-namen verhindert Channel-Collision wenn der
// Layout den Consumer mehrfach rendert (siehe feedback_realtime_channel_ids).

import { useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RueckrufeRealtimeRefresher() {
  const router = useRouter()
  const channelId = useId()

  useEffect(() => {
    const supabase = createClient()
    // Throttle: bei vielen schnellen Events in 800ms-Window nur einmal refreshen
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { router.refresh() }, 800)
    }

    const channel = supabase
      .channel(`rueckrufe-realtime-${channelId}`)
      // Neue oder veränderte Rückruf-Termine
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'admin_termine', filter: 'typ=eq.rueckruf' },
        refresh,
      )
      // Lead-Updates (z.B. Versuche, letzter_anruf_status) für die anhängenden Karten
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        refresh,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [router, channelId])

  return null
}
