'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decideProposal } from '@/lib/orchestrator/proposals'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { TaskPrioritaet } from '@/lib/tasks/types'

async function requireAdminUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  return profile?.rolle === 'admin' ? user.id : null
}

// Plan nutzte niedrig/normal/hoch — echte TaskPrioritaet ist 'normal'|'dringend'|'kritisch'.
// Mapping: hoch -> dringend, niedrig -> normal (konservativ), normal -> normal.
const PRIO_MAP: Record<string, TaskPrioritaet> = {
  niedrig: 'normal',
  normal: 'normal',
  hoch: 'dringend',
  dringend: 'dringend',
  kritisch: 'kritisch',
}

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
    const payload = (p.payload ?? {}) as {
      titel?: string
      beschreibung?: string
      prioritaet?: string
      faellig_in_tagen?: number
    }
    const faellig =
      typeof payload.faellig_in_tagen === 'number'
        ? new Date(Date.now() + payload.faellig_in_tagen * 86400000)
        : undefined
    const { task_id } = await createLinkedTask({
      titel: payload.titel ?? 'AI-Vorschlag',
      beschreibung: payload.beschreibung,
      prioritaet: payload.prioritaet ? PRIO_MAP[payload.prioritaet] : undefined,
      empfaenger_rolle: (p.ziel_rolle as string | null) ?? undefined,
      fall_id: p.claim_id as string,
      faellig_am: faellig,
      trigger_event: 'ai_orchestrator_vorschlag',
    })
    if (!task_id) return { ok: false, error: 'Task-Erstellung fehlgeschlagen' }
  }

  const res = await decideProposal(
    id,
    p.vorschlag_typ === 'task' ? 'angenommen' : 'bearbeitet',
    userId,
  )
  if (!res.ok) return res
  revalidatePath('/admin/ai-vorschlaege')
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
  revalidatePath('/admin/ai-vorschlaege')
  return { ok: true }
}
