// Ops-Cockpit Phase 3b.2 (Dispatch) — reiner Rollup ueber die LeadWorkItems fuer den
// glanceable Cockpit-Header (Gesamt aktiv, nicht-zugewiesen, Counts je Zustand). Kein I/O.

import type { LeadWorkflowState } from '@/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState'
import type { LeadWorkItem } from './lead-workstate.types'

export type LeadRollup = {
  total: number
  unassigned: number
  byState: Record<LeadWorkflowState, number>
}

function zeroByState(): Record<LeadWorkflowState, number> {
  return {
    neu: 0,
    qualifizieren: 0,
    sv_zuweisen: 0,
    flowlink_senden: 0,
    nachfassen: 0,
    warten: 0,
    rueckruf: 0,
    terminal: 0,
  }
}

/** Aggregiert die aktiven Leads fuer den Cockpit-Rollup-Header. Rein. */
export function computeLeadRollup(items: LeadWorkItem[]): LeadRollup {
  const byState = zeroByState()
  let unassigned = 0
  for (const it of items) {
    byState[it.state] += 1
    if (!it.ownerId) unassigned += 1
  }
  return { total: items.length, unassigned, byState }
}
