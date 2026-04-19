// AAR-565 (B2): Shared Phase-Component-Library — Types.
//
// Single Source of Truth für die Darstellungs-Interfaces. Wird von PhasePipeline,
// PhaseStep, SubphaseStepper und PhaseTimeline konsumiert. Die Filter-Logik
// (welche Subphasen welche Rolle sieht) lebt bewusst NICHT hier — siehe
// AAR-566 (B3) subphase-visibility.ts. Diese Types kennen nur das visible-Flag
// als Input, das vom Consumer gesetzt wird.

export type PhaseState =
  | 'upcoming'
  | 'active'
  | 'done'
  | 'blocked'
  | 'skipped'
  | 'hidden'

export type PhaseVariant =
  | 'horizontal'
  | 'vertical'
  | 'compact'
  | 'timeline'

export type Rolle = 'admin' | 'kb' | 'sv' | 'kunde' | 'makler'

export interface SubphaseData {
  id: string
  label: string
  state: PhaseState
  reachedAt?: string
  visible: boolean
}

export interface PhaseStepData {
  phase: number
  name: string
  state: PhaseState
  reachedAt?: string
  reachedBy?: string
  subphases?: SubphaseData[]
  blockReason?: string
}

export interface FallPhaseContext {
  id: string
  aktuelle_phase: string | number | null
}

export interface PhasePipelineProps {
  fall: FallPhaseContext
  rolle: Rolle
  phases: PhaseStepData[]
  variant?: PhaseVariant
  onPhaseClick?: (phase: number) => void
  showTimestamps?: boolean
  className?: string
}
