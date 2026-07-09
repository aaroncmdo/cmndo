// Ops-Cockpit Phase 3b (Dispatch) — reine Gruppierung der LeadWorkItems fuers Board.
// Kein I/O; testbar. Reihenfolge: aktion-erfordernde Zustaende zuerst (Telefon-Track +
// Funnel-Reihenfolge), passives 'warten' danach, 'terminal' zuletzt. Nur nicht-leere
// Gruppen werden zurueckgegeben (leere Zustaende clutter das Board nicht).

import type { LeadWorkflowState } from '@/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState'
import type { LeadWorkItem } from './lead-workstate.types'

export const LEAD_BOARD_STATE_ORDER: LeadWorkflowState[] = [
  'rueckruf',
  'neu',
  'qualifizieren',
  'sv_zuweisen',
  'flowlink_senden',
  'nachfassen',
  'warten',
  'terminal',
]

export type LeadBoardGroup = { state: LeadWorkflowState; items: LeadWorkItem[] }

/** Gruppiert LeadWorkItems nach Workflow-Zustand in Board-Reihenfolge; leere Gruppen entfallen. */
export function groupLeadWorkItemsByState(items: LeadWorkItem[]): LeadBoardGroup[] {
  const byState = new Map<LeadWorkflowState, LeadWorkItem[]>()
  for (const it of items) {
    const arr = byState.get(it.state)
    if (arr) arr.push(it)
    else byState.set(it.state, [it])
  }
  return LEAD_BOARD_STATE_ORDER.map((state) => ({ state, items: byState.get(state) ?? [] })).filter(
    (g) => g.items.length > 0,
  )
}
