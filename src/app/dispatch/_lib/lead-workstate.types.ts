// Ops-Cockpit Phase 3 (Dispatch) — Lead-Work-State Read-Layer-Typen.
// LeadWorkItem ist ein SEPARATER discriminated-union-Member (kind:'lead') vom
// ClaimWorkItem (kind:'claim', src/lib/ops) — Lead-View != Claim-View (Aaron,
// verbindlich): zwei Phasen-Achsen, kein lossy SQL-UNION. Vereint erst im TS.

import type { LeadWorkflowState } from '@/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState'

/**
 * Eine Zeile aus `v_lead_workstate`: leads.* + der Status des aktiven SV-Termins
 * (Q5) + die Timestamps des juengsten FlowLinks. Weil die View `leads.*` projiziert,
 * traegt jede Zeile ALLE `LeadLike`/`WorkflowLeadLike`-Felder — die Index-Signatur
 * deckt sie ab; am Call-Site wird zu `WorkflowLeadLike` gecastet.
 */
export interface LeadWorkstateRow {
  id: string
  zugewiesen_an: string | null
  vorname: string | null
  nachname: string | null
  telefon: string | null
  status: string | null
  qualifizierungs_phase: string | null
  disqualifiziert: boolean | null
  sa_unterschrieben: boolean | null
  rueckruf_geplant_am: string | null
  letzter_anruf_status: string | null
  anruf_versuche: number | null
  created_at: string | null
  updated_at: string | null
  termin_status: string | null
  fl_gesendet_am: string | null
  fl_geoeffnet_am: string | null
  fl_abgeschlossen_am: string | null
  fl_fall_id: string | null
  [k: string]: unknown
}

/** Ein Lead als Work-Item fuers Dispatch-Cockpit (Pendant zu ClaimWorkItem, kind='lead'). */
export interface LeadWorkItem {
  kind: 'lead'
  id: string
  /** leads.zugewiesen_an = der Dispatch-Owner. */
  ownerId: string | null
  /** Der abgeleitete Workflow-Zustand (aus deriveLeadWorkflowState). */
  state: LeadWorkflowState
  /** Erfuellte Qualifizierungs-Gates (0-8), fuer den Progress in der UI. */
  qualCompleted: number
  display: { title: string; telefon: string | null }
}
