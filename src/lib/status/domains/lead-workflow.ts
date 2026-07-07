// src/lib/status/domains/lead-workflow.ts
// Dispatch-Leads-Workflow-Rebuild (2026-07-07): Registry-Domain fuer den
// abgeleiteten Lead-Workflow-Zustand (deriveLeadWorkflowState). Label + Farb-Slot
// je Zustand — das Badge-Rendering laeuft ueber <StatusBadge domain="lead-workflow">.
//
// Self-contained (keine lib->app-Abhaengigkeit): die 8 Keys spiegeln die
// LeadWorkflowState-Union aus app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState.
// Drift wird per Test abgesichert (leadWorkflowMeta.test.ts prueft Registry-Paritaet).
import type { StatusDef } from '../types'

export const LEAD_WORKFLOW_DEFS = {
  neu: { label: 'Neu', short: 'Neu', slot: 'neutral' },
  qualifizieren: { label: 'Qualifizieren', short: 'Quali', slot: 'active' },
  sv_zuweisen: { label: 'SV zuweisen', short: 'SV', slot: 'active' },
  flowlink_senden: { label: 'FlowLink senden', short: 'Link', slot: 'active' },
  nachfassen: { label: 'Nachfassen', short: 'Nachfassen', slot: 'warning' },
  warten: { label: 'Warten auf Kunde', short: 'Warten', slot: 'pending' },
  rueckruf: { label: 'Rückruf', short: 'Rückruf', slot: 'warning' },
  terminal: { label: 'Abgeschlossen', short: 'Fertig', slot: 'done', isEndzustand: true },
} satisfies Record<string, StatusDef>
