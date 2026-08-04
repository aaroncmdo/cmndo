'use server'

// Freigabe-Executor fuer die KI-Aufsicht SLA-Rollen-Flaeche.
// task-only (kein fallId), claim-scoped.
// Reused: buildTaskFromProposal + decideProposal aus dem Orchestrator-Executor.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideProposal } from '@/lib/orchestrator/proposals'
import { buildTaskFromProposal } from '@/lib/orchestrator/task-from-proposal'
import type { TaskProposalPayload } from '@/lib/orchestrator/types'
import { requireAdminUserId } from '@/lib/auth/require-admin-user-id'

// ── freigebenAufsichtVorschlag ────────────────────────────────────────────────

export async function freigebenAufsichtVorschlag(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()

  // Proposal laden (nur task-Typ erwartet, claim_id genuegt — kein fallId)
  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('id, claim_id, vorschlag_typ, ziel_rolle, payload, status')
    .eq('id', proposalId)
    .maybeSingle()

  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }

  // Idempotenz-Guard: nur offene Vorschlaege verarbeiten
  if (p.status !== 'offen') return { ok: false, error: 'bereits bearbeitet' }

  const claimId = p.claim_id as string
  const payload = (p.payload ?? {}) as TaskProposalPayload

  // task → buildTaskFromProposal mit CLAIM-ID (kein fallId noetig)
  const { task_id } = await buildTaskFromProposal(
    payload,
    p.ziel_rolle as string | null,
    claimId,
    'ki_aufsicht_sla',
  )
  if (!task_id) return { ok: false, error: 'Task-Erstellung fehlgeschlagen' }

  // Proposal-Status auf 'angenommen' setzen
  const res = await decideProposal(proposalId, 'angenommen', userId)
  if (!res.ok) return res

  revalidatePath('/admin/ki-aufsicht')
  return { ok: true }
}

// ── verwerfenAufsichtVorschlag ────────────────────────────────────────────────

export async function verwerfenAufsichtVorschlag(
  proposalId: string,
  feedback?: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()

  // Idempotenz-Guard: nur offene Vorschlaege verwerfen
  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('status')
    .eq('id', proposalId)
    .maybeSingle()

  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }
  if (p.status !== 'offen') return { ok: false, error: 'bereits bearbeitet' }

  const res = await decideProposal(proposalId, 'verworfen', userId, feedback)
  if (!res.ok) return res

  revalidatePath('/admin/ki-aufsicht')
  return { ok: true }
}
