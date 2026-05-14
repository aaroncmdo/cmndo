'use client'

import { useEffect, useId } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Abonniert leads + auftraege + gutachter_termine + sachverstaendige
 * INSERT/UPDATE/DELETE für die Dispatcher-Karte (AAR-912 Karte v2).
 * Bei jeder Änderung wird `onChange()` gerufen — Caller refetched.
 *
 * Channel-Name via useId() eindeutig (Memory: feedback_realtime_channel_ids).
 */
export function useTriageRealtime(onChange: () => void): void {
  const instanceId = useId()
  useEffect(() => {
    const supabase = createClient()
    const channelName = `dispatch-karte-${instanceId}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auftraege' },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gutachter_termine' },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sachverstaendige' },
        () => onChange(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [instanceId, onChange])
}
