'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideProposal } from '@/lib/orchestrator/proposals'
import { buildTaskFromProposal } from '@/lib/orchestrator/task-from-proposal'
import { getTypeStats } from '@/lib/orchestrator/stats'
import { setAutoMode } from '@/lib/orchestrator/policy'
import type { TaskProposalPayload } from '@/lib/orchestrator/types'
import { requireAdminUserId } from '@/lib/auth/require-admin-user-id'

export async function annehmenVorschlag(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const db = createAdminClient()
  const { data: p } = await db
    .from('ai_claim_proposals')
    .select('claim_id, vorschlag_typ, ziel_rolle, payload, status')
    .eq('id', id)
    .maybeSingle()
  if (!p) return { ok: false, error: 'Vorschlag nicht gefunden' }
  // Idempotenz: nur offene Vorschlaege annehmen — verhindert Doppel-Task bei
  // Doppelklick oder Aktion auf einer stale Liste.
  if (p.status !== 'offen') return { ok: false, error: 'Vorschlag bereits bearbeitet' }

  // Nur 'task'-Vorschlaege erzeugen echte Tasks; escalation/next_step werden als 'bearbeitet' markiert.
  if (p.vorschlag_typ === 'task') {
    const payload = (p.payload ?? {}) as TaskProposalPayload
    const { task_id } = await buildTaskFromProposal(
      payload,
      p.ziel_rolle as string | null,
      p.claim_id as string,
      'ai_orchestrator_vorschlag',
    )
    if (!task_id) return { ok: false, error: 'Task-Erstellung fehlgeschlagen' }
  }

  const res = await decideProposal(
    id,
    p.vorschlag_typ === 'task' ? 'angenommen' : 'bearbeitet',
    userId,
  )
  if (!res.ok) return res
  revalidatePath('/admin/aufgaben/vorschlaege')
  return { ok: true }
}

export async function verwerfenVorschlag(
  id: string,
  feedback?: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const res = await decideProposal(id, 'verworfen', userId, feedback)
  if (!res.ok) return res
  revalidatePath('/admin/aufgaben/vorschlaege')
  return { ok: true }
}

// ── Phase 2: Auto-Graduierung ─────────────────────────────────────────────────

export async function graduiereTyp(
  vorschlagTyp: string,
  zielRolle: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  // Server-seitiger Re-Check: ready muss zum Zeitpunkt des Flips noch true sein
  const stats = await getTypeStats()
  const zeile = stats.find(
    (s) => s.vorschlagTyp === vorschlagTyp && s.zielRolle === zielRolle,
  )
  if (!zeile) return { ok: false, error: 'Statistik-Zeile nicht gefunden' }
  if (!zeile.ready) return { ok: false, error: 'Typ noch nicht graduierbar (Quote oder Mindestentscheidungen nicht erreicht)' }

  const res = await setAutoMode(vorschlagTyp, zielRolle, 'auto', userId)
  if (!res.ok) return res
  revalidatePath('/admin/aufgaben/vorschlaege')
  return { ok: true }
}

export async function zuruecksetzenTyp(
  vorschlagTyp: string,
  zielRolle: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireAdminUserId()
  if (!userId) return { ok: false, error: 'Nicht berechtigt' }

  const res = await setAutoMode(vorschlagTyp, zielRolle, 'manual', userId)
  if (!res.ok) return res
  revalidatePath('/admin/aufgaben/vorschlaege')
  return { ok: true }
}

/**
 * Anzahl offener KI-Vorschlaege — fuer die Attention-Badge im Admin-Nav.
 * ai_claim_proposals ist RLS-locked (service_role only) → nur ueber diese
 * admin-gegatete Server-Action lesbar, nicht per Client-Query.
 */
export async function getOffeneVorschlaegeCount(): Promise<number> {
  const userId = await requireAdminUserId()
  if (!userId) return 0
  const db = createAdminClient()
  const { count } = await db
    .from('ai_claim_proposals')
    .select('id', { count: 'exact', head: true })
    .eq('quelle', 'orchestrator')
    .eq('status', 'offen')
  return count ?? 0
}
