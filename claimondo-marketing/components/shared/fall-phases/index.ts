// AAR-565 (B2): Shared Phase-Component-Library — Public API.
// AAR-727 (fallphasen-glass): FallPhasenPanel als Glass-Wrapper für die 3
// Portale (Admin-aside / Kunde-progress / Gutachter-header-strip).

export { PhasePipeline } from './PhasePipeline'
export { PhaseStep } from './PhaseStep'
export { SubphaseStepper } from './SubphaseStepper'
export { PhaseStatusDot } from './PhaseStatusDot'
export { PhaseTimeline } from './PhaseTimeline'
export { FallPhasenPanel } from './FallPhasenPanel'
export type {
  FallPhasenPanelProps,
  FallPhasenPanelVariant,
} from './FallPhasenPanel'
export type {
  PhaseState,
  PhaseVariant,
  Rolle,
  SubphaseData,
  PhaseStepData,
  FallPhaseContext,
  PhasePipelineProps,
} from './types'
