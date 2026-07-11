'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'
import { isExecutorEnabled } from '@/lib/task-executor/policy'
import { executableTypeFor } from '@/lib/task-executor/registry'
import { planTaskExecution } from '@/lib/task-executor/run'
import { applyPlan } from '@/lib/task-executor/apply-plan'
import {
  insertExecution,
  markExecution,
  getOffeneExecution,
  getExecution,
} from '@/lib/task-executor/audit'
import type { TaskRow, PlanStep, ExecCtx, ExecutionPlan } from '@/lib/task-executor/types'

const TASK_COLS = 'id, typ, titel, beschreibung, status, claim_id, fall_id, empfaenger_rolle'

function revalidateTasks() {
  revalidatePath('/admin/tasks')
  revalidatePath('/admin/aufgaben/alle')
  revalidatePath('/admin/meine-tasks')
  revalidatePath('/mitarbeiter/tasks')
}

export async function starteKiAusfuehrung(taskId: string): Promise<{
  ok: boolean
  error?: string
  execution?: { id: string; status: string; plan: PlanStep[]; begruendung: string }
}> {
  if (!isExecutorEnabled()) return { ok: false, error: 'KI-Ausfuehrung ist deaktiviert.' }

  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const userId = guard.user.id

  // RLS-scoped laden: hat der User keinen Zugriff → kein Task-Row.
  const userDb = await createClient()
  const { data: taskData } = await userDb
    .from('tasks')
    .select(TASK_COLS)
    .eq('id', taskId)
    .maybeSingle()
  const task = taskData as TaskRow | null
  if (!task) return { ok: false, error: 'Aufgabe nicht gefunden oder kein Zugriff.' }
  if (!executableTypeFor(task)) return { ok: false, error: 'Diese Aufgabe ist nicht KI-ausfuehrbar.' }

  const adminDb = createAdminClient()

  // Idempotenz: existierende offene Ausfuehrung zurueckgeben statt neu planen.
  const offen = await getOffeneExecution(adminDb, taskId)
  if (offen) {
    return {
      ok: true,
      execution: { id: offen.id, status: offen.status, plan: offen.plan, begruendung: '' },
    }
  }

  let plan: ExecutionPlan
  try {
    plan = await planTaskExecution(task)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Planung fehlgeschlagen.' }
  }

  if (plan.steps.length === 0) {
    return { ok: false, error: 'Die KI sieht keine ausfuehrbare Aktion — bitte manuell.' }
  }

  const inserted = await insertExecution(adminDb, {
    taskId,
    claimId: task.claim_id,
    typ: task.typ,
    plan,
    modell: AI_MODELS.task_executor,
    userId,
  })
  if (!inserted) {
    return { ok: false, error: 'Konnte Ausfuehrung nicht anlegen (evtl. laeuft bereits eine).' }
  }

  if (plan.hatConsequential) {
    await markExecution(adminDb, inserted.id, { status: 'warte_bestaetigung' })
    revalidateTasks()
    return {
      ok: true,
      execution: {
        id: inserted.id,
        status: 'warte_bestaetigung',
        plan: plan.steps,
        begruendung: plan.begruendung,
      },
    }
  }

  const ctx: ExecCtx = {
    db: adminDb,
    task,
    claimId: task.claim_id as string,
    fallId: task.fall_id,
    userId,
  }
  const applied = await applyPlan(plan, ctx)
  await markExecution(adminDb, inserted.id, {
    status: applied.status,
    steps: applied.steps,
    fehler: applied.fehler,
  })
  revalidateTasks()
  if (applied.status !== 'ausgefuehrt') {
    return { ok: false, error: applied.fehler ?? 'Ausfuehrung fehlgeschlagen.' }
  }
  return {
    ok: true,
    execution: { id: inserted.id, status: 'ausgefuehrt', plan: applied.steps, begruendung: plan.begruendung },
  }
}

export async function bestaetigeKiAusfuehrung(
  execId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isExecutorEnabled()) return { ok: false, error: 'KI-Ausfuehrung ist deaktiviert.' }

  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const userId = guard.user.id

  const adminDb = createAdminClient()
  const exec = await getExecution(adminDb, execId)
  if (!exec) return { ok: false, error: 'Ausfuehrung nicht gefunden.' }
  if (exec.status !== 'warte_bestaetigung') {
    return { ok: false, error: 'Ausfuehrung ist nicht (mehr) bestaetigbar.' }
  }

  // RLS-Zugriff des Users auf den Task pruefen.
  const userDb = await createClient()
  const { data: taskData } = await userDb
    .from('tasks')
    .select(TASK_COLS)
    .eq('id', exec.task_id)
    .maybeSingle()
  const task = taskData as TaskRow | null
  if (!task) return { ok: false, error: 'Kein Zugriff auf die Aufgabe.' }

  const ctx: ExecCtx = {
    db: adminDb,
    task,
    claimId: task.claim_id as string,
    fallId: task.fall_id,
    userId,
  }
  const applied = await applyPlan(
    { steps: exec.plan, begruendung: '', hatConsequential: true },
    ctx,
  )
  await markExecution(adminDb, execId, {
    status: applied.status,
    steps: applied.steps,
    bestaetigtVon: userId,
    fehler: applied.fehler,
  })
  revalidateTasks()
  if (applied.status !== 'ausgefuehrt') {
    return { ok: false, error: applied.fehler ?? 'Ausfuehrung fehlgeschlagen.' }
  }
  return { ok: true }
}

export async function brichAbKiAusfuehrung(
  execId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }

  const adminDb = createAdminClient()
  const exec = await getExecution(adminDb, execId)
  if (!exec) return { ok: false, error: 'Ausfuehrung nicht gefunden.' }
  if (exec.status !== 'warte_bestaetigung') {
    return { ok: false, error: 'Nur wartende Ausfuehrungen koennen abgebrochen werden.' }
  }
  await markExecution(adminDb, execId, { status: 'abgebrochen' })
  revalidateTasks()
  return { ok: true }
}
