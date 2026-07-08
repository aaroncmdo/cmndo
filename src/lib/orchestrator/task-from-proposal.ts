// KEIN 'use server' — darf auch vom Auto-Pfad (T4b) importiert werden.
// Shared helper: Admin-Approve + Auto-Graduierung erzeugen exakt denselben Task.

import { createLinkedTask } from '@/lib/tasks/create-task'
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
  fall_id: string
  faellig_am?: Date
  trigger_event: string
}

/**
 * Mappt ein TaskProposalPayload auf die Parameter fuer createLinkedTask.
 * Pure Funktion — kein DB-Zugriff, vollstaendig testbar.
 */
export function mapProposalToTaskParams(
  payload: TaskProposalPayload,
  zielRolle: string | null,
  claimId: string,
  triggerEvent: string,
): TaskFromProposalParams {
  return {
    titel: payload.titel ?? 'AI-Vorschlag',
    beschreibung: payload.beschreibung,
    prioritaet: payload.prioritaet ? PRIO_MAP[payload.prioritaet] : undefined,
    empfaenger_rolle: zielRolle ?? undefined,
    fall_id: claimId,
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
  return createLinkedTask(mapProposalToTaskParams(payload, zielRolle, claimId, triggerEvent))
}
