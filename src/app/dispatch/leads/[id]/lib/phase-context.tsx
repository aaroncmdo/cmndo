'use client'

// AAR-136 / W2: Phase-Context für die neue Dispatch-Shell.
// Hält currentPhase + Lead-Snapshot + QualificationResult. Wird in W3
// (DispatchShell) mit initialLead/initialTermin aus der Server-Page befüllt.
// Server-Side-Updates (saveHardGate etc.) triggern router.refresh() — dann
// rendert die Server-Component neu und frische Props fließen in den Context.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
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
  const qualification = useMemo(
    () => computeQualificationStatus(initialLead, initialTermin),
    [initialLead, initialTermin],
  )

  const value: DispatchState = {
    currentPhase,
    setPhase,
    lead: initialLead,
    aktiverTermin: initialTermin,
    qualification,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
