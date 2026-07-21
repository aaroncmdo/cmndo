'use client'

// AAR-864: Live-Aktualisierung für Fall-Detail-Pages.
// Abonniert gutachter_termine + auftraege auf Änderungen für einen
// bestimmten fall_id und ruft router.refresh() — die Server-Page rendert
// dann mit force-dynamic neu, alle Verlegungs-/Termin-/Phasen-Banner
// reflektieren den frischen DB-State ohne dass der User refreshen muss.
//
// Nutzbar in beiden Portalen: /kunde/faelle/[id] und /gutachter/fall/[id].
//
// CMM-65: Der dritte Leg lauscht jetzt auf `claims` (id=eq.claimId) statt
// `faelle` (id=eq.fallId). Grund: die "Fall touchen"-Writer schreiben den
// Recency-Bump seit dem Writer-Sweep auf claims.updated_at (claims = SSoT) —
// faelle.updated_at wird nicht mehr aktiv beschrieben. claims liegt mit
// REPLICA IDENTITY FULL in der supabase_realtime-Publication (Migration
// 20260502004338) und ist per claims_kunde_via_party_select / is_sv_for_claim
// fuer Kunde/SV/Admin RLS-lesbar — also realtime-fähig.

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, whenRealtimeAuthReady } from '@/lib/supabase/client'

type Props = {
  fallId: string
  /** claims.id des Falls — Ziel der Recency-Subscription (CMM-65). */
  claimId: string | null
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
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
        timerRef.current = null
      }, debounceMs)
    }

    // Erst auf den Realtime-Auth-Token warten (setAuth ist async in client.ts),
    // DANN joinen. Sonst joint der gutachter_termine/auftraege/claims-Leg als
    // `anon` (Race gegen das async setAuth) → walrus `permission denied`. Der
    // claim_recency-Leg ist zwar anon-lesbar, aber wir gaten den GANZEN Channel,
    // da die anon-gesperrten Legs sonst den WAL-Poll fuer den ganzen Channel
    // brechen. Siehe whenRealtimeAuthReady() in client.ts.
    void whenRealtimeAuthReady().then(async () => {
      if (cancelled) return
      // #4543-Muster: gutachter_termine/auftraege/claims sind anon-gesperrt (PII-
      // Haertung). Ohne Session laeuft der Realtime-Socket als anon -> walrus
      // `permission denied` (verbliebener Rest-Race trotz whenRealtimeAuthReady;
      // z.B. Session-Expiry-/Token-Refresh-Fenster). Deshalb diese Legs NUR mit
      // Session joinen; claim_recency (anon-lesbar, keine sensiblen Spalten) traegt
      // den Live-Refresh auch ohne Session -> keine Regression fuer Session-Faelle.
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      let ch = supabase.channel(`fall-rt-${fallId}-${channelId}`)
      if (session) {
        ch = ch
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
      }

      // CMM-65: Recency-Leg auf claims (SSoT) statt faelle. Nur wenn claimId
      // vorhanden (faelle.claim_id ist NOT NULL — Guard ist defensiv).
      // Kunde/Admin koennen claims lesen -> dieser Leg faengt JEDE claims-Aenderung
      // (status, sv_id, …) via moddatetime. Fuer den SV ist er RLS-tot (CMM-60 Phase 4
      // entzog dem SV claims-SELECT) -> der SV bekommt seinen Live-Refresh ueber den
      // claim_recency-Leg unten.
      if (claimId) {
        // claims ist anon-gesperrt -> nur mit Session (s.o.). claim_recency unten
        // ist anon-lesbar und laeuft in beiden Faellen weiter.
        if (session) {
          ch = ch.on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'claims',
              filter: `id=eq.${claimId}`,
            },
            scheduleRefresh,
          )
        }
        // CMM-66: zusaetzlicher Leg auf die leak-freie Recency-SSoT claim_recency
        // (claim_id + last_activity_at, KEINE sensiblen Spalten) — die auch der SV
        // lesen darf. Bumps via touch_claim_recency()/transitionFallStatus. Additiv
        // (kein Removal des claims-Legs) -> keine Regression fuer Kunde/Admin.
        ch = ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'claim_recency',
            filter: `claim_id=eq.${claimId}`,
          },
          scheduleRefresh,
        )
      }

      ch.subscribe()
      channel = ch
    })

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [fallId, claimId, channelId, router, debounceMs])

  return null
}
