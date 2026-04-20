'use client'

// AAR-136 / W2: Phase-Context für die neue Dispatch-Shell.
// Hält currentPhase + Lead-Snapshot + QualificationResult. Wird in W3
// (DispatchShell) mit initialLead/initialTermin aus der Server-Page befüllt.
// Server-Side-Updates (saveHardGate etc.) triggern router.refresh() — dann
// rendert die Server-Component neu und frische Props fließen in den Context.
//
// patchLead(): optimistisches Update das phase-übergreifend überlebt.
// Problem ohne patchLead: Sprache (und andere Felder) werden per saveStammdaten
// in die DB geschrieben + router.refresh() gestartet. Navigiert der User
// schneller zur nächsten Phase als refresh() durchkommt, unmountet Phase 1.
// Beim Zurücknavigieren re-initialisiert useState() aus initialLead — der
// noch den alten Wert hält → Wert springt zurück.

import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react'
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

  // AAR-realtime: Safety-Net. `useState(initialLead)` initialisiert nur beim
  // Mount — nach `router.refresh()` (Server-Component lädt frische Daten)
  // würde der Provider-State stale bleiben. Wir syncen daher auf
  // `initialLead.updated_at`-Changes. Das ist Defense-in-Depth; der saubere
  // Pfad bleibt `patchLead({...})` direkt nach einem erfolgreichen Write
  // damit der Context sofort sync ist, ohne auf den Server-Roundtrip zu
  // warten. Wir überschreiben nur wenn Server eine neuere updated_at liefert
  // (sonst racen optimistic patches gegen den State).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
