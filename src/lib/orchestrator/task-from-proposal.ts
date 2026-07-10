// KEIN 'use server' — darf auch vom Auto-Pfad (T4b) importiert werden.
// Shared helper: Admin-Approve + Auto-Graduierung erzeugen exakt denselben Task.

import { createLinkedTask } from '@/lib/tasks/create-task'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskPrioritaet } from '@/lib/tasks/types'
import type { TaskProposalPayload } from './types'

// Plan nutzte niedrig/normal/hoch — echte TaskPrioritaet ist 'normal'|'dringend'|'kritisch'.
// Mapping: hoch -> dringend, niedrig -> normal (konservativ), normal -> normal.
export const PRIO_MAP: Record<string, TaskPrioritaet> = {
  niedrig: 'normal',
  normal: 'normal',
  hoch: 'dringend',
  dringend: 'dringend',
  kritisch: 'kritisch',
}

export type TaskFromProposalParams = {
  titel: string
  beschreibung?: string
  prioritaet?: TaskPrioritaet
  empfaenger_rolle?: string
  // fall_id = faelle_claim_bridge.fall_id (tasks.fall_id-FK-Domain), aufgeloest aus claim_id.
  // Optional, weil eine claim ohne Bridge-Zeile keinen fall_id hat — dann traegt claim_id den Task.
  fall_id?: string | null
  // claim_id = claims.id (SSoT-Anker, tasks.claim_id-FK).
  claim_id: string
  faellig_am?: Date
  trigger_event: string
  empfaenger_user_id?: string | null
}

/**
 * Fall-Owner fuer die Zielrolle: KB-Tasks an den betreuenden KB, SV-Tasks an
 * den zugewiesenen SV. Andere Rollen (admin) haben keinen Einzel-Owner → null
 * (Caller faellt auf das Least-Loaded-Auto-Assign in createLinkedTask zurueck).
 * Pure — kein DB-Zugriff.
 */
export function assigneeFromClaim(
  claim: { kundenbetreuer_id: string | null; sv_id: string | null },
  zielRolle: string | null,
): string | null {
  if (zielRolle === 'kundenbetreuer') return claim.kundenbetreuer_id ?? null
  if (zielRolle === 'sachverstaendiger') return claim.sv_id ?? null
  return null
}

/**
 * Mappt ein TaskProposalPayload auf die Parameter fuer createLinkedTask.
 * Pure Funktion — kein DB-Zugriff, vollstaendig testbar.
 */
export function mapProposalToTaskParams(
  payload: TaskProposalPayload,
  zielRolle: string | null,
  fallId: string | null,
  claimId: string,
  triggerEvent: string,
  empfaengerUserId?: string | null,
): TaskFromProposalParams {
  return {
    titel: payload.titel ?? 'AI-Vorschlag',
    beschreibung: payload.beschreibung,
    prioritaet: payload.prioritaet ? PRIO_MAP[payload.prioritaet] : undefined,
    empfaenger_rolle: zielRolle ?? undefined,
    empfaenger_user_id: empfaengerUserId ?? undefined,
    // fall_id kommt aus der Bridge-Aufloesung (fallId), NICHT aus claimId — sonst
    // verletzt der tasks-insert tasks_fall_id_fkey (FK auf faelle_claim_bridge.fall_id).
    fall_id: fallId ?? undefined,
    claim_id: claimId,
    faellig_am:
      typeof payload.faellig_in_tagen === 'number'
        ? new Date(Date.now() + payload.faellig_in_tagen * 86400000)
        : undefined,
    trigger_event: triggerEvent,
  }
}

/**
 * Erzeugt einen Task aus einem TaskProposalPayload via createLinkedTask.
 * Wird sowohl vom Admin-Approve als auch vom Auto-Pfad (Phase 2) genutzt,
 * damit beide exakt denselben Task erzeugen (byte-identische Parameter).
 */
export async function buildTaskFromProposal(
  payload: TaskProposalPayload,
  zielRolle: string | null,
  claimId: string,
  triggerEvent: string,
): Promise<{ task_id: string | null }> {
  // Owner-Routing: Task an den Fall-Owner der Zielrolle (KB/SV). Fallback auf
  // das Least-Loaded-Auto-Assign in createLinkedTask (kein Owner / Load-Fehler).
  // Non-critical — der Task entsteht in jedem Fall.
  let empfaengerUserId: string | null = null
  // fall_id-Aufloesung: tasks.fall_id FKt auf faelle_claim_bridge.fall_id, NICHT auf
  // claims.id. claim_id und fall_id sind verschieden (CMM-49-Invariante), daher die
  // Bridge-Aufloesung. Ohne sie schlug der tasks-insert mit tasks_fall_id_fkey fehl
  // ("Task-Erstellung fehlgeschlagen" im /admin/ai-vorschlaege-Approve).
  let fallId: string | null = null
  try {
    const db = createAdminClient()
    const { data: claim } = await db
      .from('claims')
      .select('kundenbetreuer_id, sv_id')
      .eq('id', claimId)
      .maybeSingle()
    if (claim) {
      empfaengerUserId = assigneeFromClaim(
        claim as { kundenbetreuer_id: string | null; sv_id: string | null },
        zielRolle,
      )
    }
    const { data: bridge } = await db
      .from('faelle_claim_bridge')
      .select('fall_id')
      .eq('claim_id', claimId)
      .maybeSingle()
    fallId = (bridge as { fall_id: string | null } | null)?.fall_id ?? null
  } catch {
    // Owner-/Bridge-Load fehlgeschlagen → Auto-Assign-Fallback; claim_id bleibt der Anker.
  }
  return createLinkedTask(
    mapProposalToTaskParams(payload, zielRolle, fallId, claimId, triggerEvent, empfaengerUserId),
  )
}
