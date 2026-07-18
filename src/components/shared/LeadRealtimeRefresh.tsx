'use client'

// AAR-956 Self-Service #3: Live-Aktualisierung fuer die Lead-zentrierten Seiten.
// Modell (Aaron 14.06.): Der Lead-Row ist Single Source of Truth — /flow (Kunde)
// UND /dispatch/leads/[id] lesen/schreiben denselben Lead realtime. Diese
// Komponente abonniert die leads-Row und ruft debounced router.refresh(), sodass
// die Server-Component mit frischem DB-State neu rendert (ohne manuellen Reload).
//
// Geteilter Consumer (beide rendern null, kein Layout-Impact):
//  - Dispatch-Detail (watchTermine=true): rollenbasierte leads-RLS (is_admin/
//    profiles.rolle) → UPDATE kommt mit Default-REPLICA-IDENTITY an; zusaetzlich
//    gutachter_termine fuer live Slot-Buchungen.
//  - /flow (anon Kunde, watchTermine=false): die anon-Policy "Flow anon select
//    leads" (status='flow-gesendet') ist column-gegatet → braucht leads
//    REPLICA IDENTITY FULL (Migration), damit Realtime die UPDATE-Events an den
//    anon-Client liefert. gutachter_termine wird hier NICHT abonniert (kein
//    anon-Zugriff). router.refresh() ist ein Soft-Refresh: die server-abgeleiteten
//    Props (reservierter SV/Termin, besichtigungsort, …) ziehen nach, der lokale
//    Wizard-Input bleibt erhalten.
//
// Pattern aus FallRealtimeRefresh (AAR-864): useId() gegen StrictMode-Channel-
// Races, Debounce gegen Refresh-Sturm bei mehreren schnellen Writes.

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'

type Props = {
  leadId: string
  /** Zusaetzlich auf gutachter_termine (lead_id + bezug_id) lauschen — fuer
   *  Dispatch (Slot-Buchungen live sichtbar). Default false. */
  watchTermine?: boolean
  /** Debounce zwischen mehreren schnellen Events (ms). Default 500. */
  debounceMs?: number
}

export default function LeadRealtimeRefresh({ leadId, watchTermine = false, debounceMs = 500 }: Props) {
  const router = useRouter()
  const channelId = useId()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!leadId) return
    const supabase = createClient()

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
        timerRef.current = null
      }, debounceMs)
    }

    const cleanupChannel = subscribeWhenAuthed(supabase, () => {
      let channel = supabase
        .channel(`lead-rt-${leadId}-${channelId}`)
        // Kern: leads-Row aendert sich (Kunde fuellt /flow, Dispatcher editiert, …).
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadId}` },
          scheduleRefresh,
        )

      if (watchTermine) {
        // Klassisch gebundene Termine (lead_id gesetzt).
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gutachter_termine', filter: `lead_id=eq.${leadId}` },
          scheduleRefresh,
        )
        // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL, bezug_id=lead).
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gutachter_termine', filter: `bezug_id=eq.${leadId}` },
          scheduleRefresh,
        )
      }

      return channel
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      cleanupChannel()
    }
  }, [leadId, watchTermine, channelId, router, debounceMs])

  return null
}
