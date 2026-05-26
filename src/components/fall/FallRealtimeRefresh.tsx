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
import { createClient } from '@/lib/supabase/client'

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

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        router.refresh()
        timerRef.current = null
      }, debounceMs)
    }

    let channel = supabase
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

    // CMM-65: Recency-Leg auf claims (SSoT) statt faelle. Nur wenn claimId
    // vorhanden (faelle.claim_id ist NOT NULL — Guard ist defensiv).
    // Kunde/Admin koennen claims lesen -> dieser Leg faengt JEDE claims-Aenderung
    // (status, sv_id, …) via moddatetime. Fuer den SV ist er RLS-tot (CMM-60 Phase 4
    // entzog dem SV claims-SELECT) -> der SV bekommt seinen Live-Refresh ueber den
    // claim_recency-Leg unten.
    if (claimId) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'claims',
          filter: `id=eq.${claimId}`,
        },
        scheduleRefresh,
      )
      // CMM-66: zusaetzlicher Leg auf die leak-freie Recency-SSoT claim_recency
      // (claim_id + last_activity_at, KEINE sensiblen Spalten) — die auch der SV
      // lesen darf. Bumps via touch_claim_recency()/transitionFallStatus. Additiv
      // (kein Removal des claims-Legs) -> keine Regression fuer Kunde/Admin.
      channel = channel.on(
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

    channel.subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [fallId, claimId, channelId, router, debounceMs])

  return null
}
