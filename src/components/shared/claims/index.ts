// AAR-840: Shared Claims-Components — Single Source für alle Portale
// (Admin, KB, SV, Kunde). AAR-843 ergänzt timeline/.

export { ClaimStatusBadge } from './ClaimStatusBadge'
export { ClaimPhaseBadge } from './ClaimPhaseBadge'
export { PhasePipeline } from './PhasePipeline'
export { EndzustandDropdown } from './EndzustandDropdown'
export { EndzustandModal, type EndzustandMode } from './EndzustandModal'

export {
  CLAIM_STATUS,
  getStatusMapping,
  type ClaimStatus,
} from './status-mappings'

export {
  CLAIM_PHASE,
  PIPELINE_PHASES,
  getPhaseMapping,
  type ClaimPhase,
} from './phase-mappings'
