// AAR-840: Shared Claims-Components — Single Source für alle Portale
// (Admin, KB, SV, Kunde). AAR-843 ergänzt timeline/.

export { ClaimStatusBadge } from './ClaimStatusBadge'
export { EndzustandDropdown } from './EndzustandDropdown'
export { EndzustandModal, type EndzustandMode } from './EndzustandModal'

export {
  CLAIM_STATUS,
  getStatusMapping,
  type ClaimStatus,
} from './status-mappings'

// CMM-44 MP-4a: ClaimPhaseBadge + PhasePipeline + phase-mappings (11-Code,
// 0 Consumer) entfernt — die Phasen-Anzeige laeuft jetzt ueber das 4-Phasen-Modell
// (getClaimLifecycle / v_claim_phase, MP-3) bzw. die shared fall-phases-Lib.

// AAR-842: Kanzlei-Ansprechpartner-Block (zwei Variants)
export { KanzleiAnsprechpartnerBlock } from './KanzleiAnsprechpartnerBlock'

// AAR-841 Frontend: Kanzlei-Wunsch-Form + Modal-Wrapper + Override-Dropdown (KB)
export { KanzleiWunschForm } from './KanzleiWunschForm'
export { KanzleiWunschModal } from './KanzleiWunschModal'
export { KanzleiWunschDropdown } from './KanzleiWunschDropdown'

// AAR-843: Timeline-Components + Display-Mappings
export { TimelineView, TimelineEventCard, TimelineFutureSection } from './timeline'
export {
  TIMELINE_EVENT_DISPLAY,
  KATEGORIE_LABEL,
  getEventDisplay,
  eventLabel,
  type TimelineEventKategorie,
} from './timeline-event-mappings'
