// src/lib/ops/derive-claim-workflow-state.ts
// Reine Ableitung: v_claim_workstate-Zeile -> ClaimWorkItem. Kein I/O, testbar.
import { toClaimMainPhase, toClaimSubPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'
import { CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS } from './claim-workflow-meta'
import type { ClaimWorkItem, ClaimWorkstateRow } from './claim-workstate.types'

const MS_PER_DAY = 86_400_000

/** Bester verfuegbarer "seit wann in dieser Phase"-Zeitstempel (Heuristik, v_claim_full-Spalten). */
function phaseSince(row: ClaimWorkstateRow, sub: ClaimSubPhase): string | null {
  if (sub === 'anschlussschreiben') return row.anschlussschreiben_am ?? row.updated_at
  if (sub === 'gutachten' || sub === 'termin' || sub === 'besichtigung') return row.sv_zugewiesen_am ?? row.updated_at
  return row.updated_at ?? row.created_at
}

export function deriveClaimWorkflowState(row: ClaimWorkstateRow, now: Date = new Date()): ClaimWorkItem {
  const stage = toClaimMainPhase(row.main_phase)
  const subState = toClaimSubPhase(row.sub_phase)
  const meta = CLAIM_WORKFLOW_META[subState]

  const sla = CLAIM_SLA_DAYS[subState]
  const since = phaseSince(row, subState)
  let overdueSinceDays: number | null = null
  let isOverdue = false
  if (sla != null && since) {
    const days = Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY)
    overdueSinceDays = days
    isOverdue = days > sla
  }

  return {
    kind: 'claim',
    id: row.claim_id,
    fallId: row.fall_id,
    claimNummer: row.claim_nummer,
    stage,
    subState,
    nextActionCode: meta.nextActionCode,
    ownerRole: meta.ownerRole,
    waitingOn: meta.waitingOn,
    isOverdue,
    overdueSinceDays,
    display: {
      title: row.kunde_name ?? row.claim_nummer ?? row.claim_id,
      kennzeichen: row.kennzeichen,
      schadenhoehe: row.schadenhoehe,
    },
    editable: {
      notizen: row.edit_notizen,
      interneNotizen: row.edit_interne_notizen,
      schadensHoeheNetto: row.edit_schadens_hoehe_netto,
    },
  }
}
