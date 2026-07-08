// src/lib/ops/claim-workstate.types.ts
// Work-state contract for the ops cockpits (Claim side). Read-model shapes only.
import type { ClaimMainPhase, ClaimSubPhase } from '@/lib/claims/lifecycle'

/** One row of v_claim_workstate (see supabase/migrations/*_v_claim_workstate.sql). */
export interface ClaimWorkstateRow {
  claim_id: string
  claim_nummer: string | null
  lead_id: string | null
  kundenbetreuer_id: string | null
  sv_id: string | null
  main_phase: string | null
  sub_phase: string | null
  status: string | null
  operative_status: string | null
  ist_aktiv: boolean | null
  kennzeichen: string | null
  kunde_name: string | null
  schadenhoehe: number | null
  sa_unterschrieben: boolean | null
  sv_zugewiesen_am: string | null
  gutachten_eingegangen_am: string | null
  anschlussschreiben_am: string | null
  regulierung_am: string | null
  abgeschlossen_am: string | null
  storniert_am: string | null
  updated_at: string | null
  created_at: string | null
  dokumente_vollstaendig_fuer_phase: string | null
  vs_eskalationsstufe: string | null
  fall_id: string | null
  edit_notizen: string | null
  edit_interne_notizen: string | null
  edit_schadens_hoehe_netto: number | null
}

/** Wer ist als Nächstes am Zug. */
export type OwnerRole = 'kb' | 'sv' | 'dispatch' | 'kanzlei' | 'intern' | 'none'
/** Worauf der Fall wartet (blockiert). */
export type WaitingOn = 'kunde' | 'sv' | 'vs' | 'kanzlei' | 'intern' | 'none'

/** Nächste-beste-Aktion je Claim-Sub-Phase. Keyed nvm sub_phase in claimWorkflowMeta. */
export type ClaimNextActionCode =
  | 'sa_anfordern' | 'vollmacht_anfordern' | 'onboarding_treiben'
  | 'sv_termin_setzen' | 'besichtigung_laeuft' | 'gutachten_ausstehend'
  | 'filmcheck' | 'qc_pruefung' | 'kanzlei_uebergeben'
  | 'anschlussschreiben' | 'vs_nachfassen' | 'kuerzung_pruefen'
  | 'nachbesichtigung' | 'nachforderung_treiben' | 'auszahlung_pruefen'
  | 'abgeschlossen'

/** Das vereinheitlichte Cockpit-Item (Claim-Zweig; Lead-Zweig kommt in einem eigenen Plan). */
export interface ClaimWorkItem {
  kind: 'claim'
  id: string
  fallId: string | null
  claimNummer: string | null
  stage: ClaimMainPhase
  subState: ClaimSubPhase
  nextActionCode: ClaimNextActionCode
  ownerRole: OwnerRole
  waitingOn: WaitingOn
  isOverdue: boolean
  overdueSinceDays: number | null
  display: { title: string; kennzeichen: string | null; schadenhoehe: number | null }
  /** Rohe editierbare claims-Felder (aktuelle Werte) — via v_claim_workstate.edit_* (Phase 1c). */
  editable: { notizen: string | null; interneNotizen: string | null; schadensHoeheNetto: number | null }
}
