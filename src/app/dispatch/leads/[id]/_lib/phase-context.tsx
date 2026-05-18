'use client'

// AAR-136 / W2: Phase-Context für die neue Dispatch-Shell.
// Hält currentPhase + Lead-Snapshot + QualificationResult. Wird in W3
// (DispatchShell) mit initialLead/initialTermin aus der Server-Page befüllt.
//
// AAR-636: Das frühere Pattern (useState(initialLead) + router.refresh() +
// patchLead als Workaround) hatte zwei Failure Modes:
//   1. router.refresh() updated Server-Props, aber useState re-initialisiert
//      nicht bei Prop-Change → stale State, Phase-Gate rechnet mit alt
//   2. Multi-Client: zweiter Admin sieht Dispatcher-Edits erst bei Reload
//
// Neues Pattern (hybrid):
//   - useState(initialLead) bleibt als Optimistic-State (sub-second feedback
//     bei eigenen Edits via patchLead)
//   - Supabase-Realtime-Subscription auf leads-Row pusht echte DB-Changes
//     automatisch in den State (egal ob vom eigenen Client oder extern)
//   - useEffect-Sync gegen updated_at als Fallback falls WS mal droppt
//   - patchLead bleibt als API weil Optimistic-UI schneller ist als
//     Realtime-Roundtrip (Geocoding, Formatter-Effekte bleiben UI-snappy)

import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  computeQualificationStatus,
  type LeadLike,
  type AktiverTerminLike,
  type QualificationResult,
} from './qualification-engine'

export type Phase = 1 | 2 | 3 | 4 | 5 | 6

type DispatchState = {
  currentPhase: Phase
  setPhase: (p: Phase) => void
  lead: LeadLike & { id: string }
  patchLead: (patch: Partial<LeadLike & { id: string }>) => void
  aktiverTermin: AktiverTerminLike
  qualification: QualificationResult
}

const Ctx = createContext<DispatchState | null>(null)

export function useDispatchPhase(): DispatchState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDispatchPhase muss innerhalb von DispatchPhaseProvider genutzt werden')
  return c
}

export function DispatchPhaseProvider({
  children,
  initialLead,
  initialTermin,
  initialPhase = 1,
}: {
  children: ReactNode
  initialLead: LeadLike & { id: string }
  initialTermin: AktiverTerminLike
  initialPhase?: Phase
}) {
  const [currentPhase, setPhase] = useState<Phase>(initialPhase)
  const [lead, setLead] = useState<LeadLike & { id: string }>(initialLead)

  // AAR-realtime: Safety-Net für Prop-Changes nach router.refresh(). Wird
  // erzeugt wenn kein Supabase-Realtime-Event ankam (WS-Drop, Tab-Wake nach
  // Suspend). Überschreibt nur wenn Server-Stand neuer ist als Context.
  useEffect(() => {
    const serverUpdated = (initialLead as Record<string, unknown>).updated_at as string | null | undefined
    setLead((prev) => {
      const prevUpdated = (prev as Record<string, unknown>).updated_at as string | null | undefined
      if (!serverUpdated) return prev
      if (prev.id !== initialLead.id) return initialLead
      if (!prevUpdated || new Date(serverUpdated) >= new Date(prevUpdated)) {
        return { ...prev, ...initialLead }
      }
      return prev
    })
  }, [initialLead])

  // AAR-636: Supabase-Realtime-Subscription. Bei jedem UPDATE auf der
  // leads-Row (egal von welchem Client) mergen wir die neuen Spalten in den
  // State. Das ersetzt router.refresh() als Sync-Mechanismus — DB wird zur
  // Source of Truth, Client ist Beobachter.
  //
  // Wir vergleichen updated_at um zu vermeiden dass wir eigene optimistic
  // Patches überschreiben die noch nicht in der DB sind.
  useEffect(() => {
    const leadId = initialLead.id
    if (!leadId) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel(`dispatch-lead:${leadId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadId}` },
        (payload) => {
          const next = payload.new as Record<string, unknown>
          setLead((prev) => {
            const prevUpdated = (prev as Record<string, unknown>).updated_at as string | null | undefined
            const nextUpdated = next.updated_at as string | null | undefined
            if (prevUpdated && nextUpdated && new Date(nextUpdated) < new Date(prevUpdated)) {
              // Eigener optimistic Patch ist neuer — Realtime-Push ignorieren
              return prev
            }
            return { ...prev, ...next } as LeadLike & { id: string }
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [initialLead.id])

  const patchLead = useCallback((patch: Partial<LeadLike & { id: string }>) => {
    setLead((prev) => ({
      ...prev,
      ...patch,
      // Optimistisch die updated_at hochziehen damit der useEffect-Sync
      // unseren gerade gepatchten State nicht sofort mit Server-Stand
      // überschreibt (der könnte noch vom letzten Roundtrip sein).
      updated_at: new Date().toISOString(),
    } as LeadLike & { id: string }))
  }, [])

  const qualification = useMemo(
    () => computeQualificationStatus(lead, initialTermin),
     
    [lead, initialTermin],
  )

  const value: DispatchState = {
    currentPhase,
    setPhase,
    lead,
    patchLead,
    aktiverTermin: initialTermin,
    qualification,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
