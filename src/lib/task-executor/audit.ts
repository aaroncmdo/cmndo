// src/lib/task-executor/audit.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionPlan, PlanStep } from './types'

const ENDZUSTAENDE = new Set(['ausgefuehrt', 'abgebrochen', 'fehler'])

/**
 * Legt einen neuen Execution-Datensatz mit status='geplant' an.
 * Speichert plan.steps in der plan-Spalte (JSON-Array), begruendung separat.
 * Gibt { id } bei Erfolg, null bei Fehler (kein throw).
 */
export async function insertExecution(
  db: SupabaseClient,
  args: {
    taskId: string
    claimId: string | null
    typ: string | null
    plan: ExecutionPlan
    modell: string
    userId: string
  },
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('ai_task_executions')
    .insert({
      task_id: args.taskId,
      claim_id: args.claimId,
      typ: args.typ,
      status: 'geplant',
      plan: args.plan.steps,
      begruendung: args.plan.begruendung,
      modell: args.modell,
      gestartet_von: args.userId,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[task-executor] insertExecution failed:', error?.message)
    return null
  }
  return { id: (data as { id: string }).id }
}

/**
 * Aktualisiert Status (+ optional steps/bestaetigtVon/fehler) eines Execution-Datensatzes.
 * Setzt abgeschlossen_am automatisch bei Endzustaenden (ausgefuehrt/abgebrochen/fehler).
 * Kein throw — loggt Fehler intern.
 */
export async function markExecution(
  db: SupabaseClient,
  id: string,
  patch: {
    status: string
    steps?: PlanStep[]
    bestaetigtVon?: string
    fehler?: string
  },
): Promise<void> {
  const update: Record<string, unknown> = { status: patch.status }
  if (patch.steps !== undefined) update.plan = patch.steps
  if (patch.bestaetigtVon !== undefined) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.fehler !== undefined) update.fehler = patch.fehler
  if (ENDZUSTAENDE.has(patch.status)) update.abgeschlossen_am = new Date().toISOString()
  const { error } = await db.from('ai_task_executions').update(update).eq('id', id)
  if (error) console.error('[task-executor] markExecution failed:', error.message)
}

/**
 * Laedt den offenen (geplant | warte_bestaetigung) Execution-Datensatz fuer einen Task.
 * Gibt null zurueck wenn kein offener Datensatz existiert.
 */
export async function getOffeneExecution(
  db: SupabaseClient,
  taskId: string,
): Promise<{ id: string; status: string; plan: PlanStep[] } | null> {
  const { data } = await db
    .from('ai_task_executions')
    .select('id, status, plan')
    .eq('task_id', taskId)
    .in('status', ['geplant', 'warte_bestaetigung'])
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; status: string; plan: PlanStep[] | null }
  return { id: row.id, status: row.status, plan: row.plan ?? [] }
}

/**
 * Laedt einen einzelnen Execution-Datensatz anhand seiner ID.
 * Gibt null zurueck wenn nicht gefunden.
 */
export async function getExecution(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; task_id: string; claim_id: string | null; status: string; plan: PlanStep[] } | null> {
  const { data } = await db
    .from('ai_task_executions')
    .select('id, task_id, claim_id, status, plan')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    task_id: string
    claim_id: string | null
    status: string
    plan: PlanStep[] | null
  }
  return { ...row, plan: row.plan ?? [] }
}
