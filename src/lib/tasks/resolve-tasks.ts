'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskEntityType } from './types'

type ResolveResult = {
  resolved_count: number
  notified_count: number
  task_ids: string[]
}

/**
 * KFZ-151: Zentraler Resolver fuer Auto-Resolve.
 *
 * Schliesst alle offenen Tasks zu einer Entitaet sobald diese nachweislich
 * erledigt ist. Aaron-Regeln:
 * - NUR Tasks die niemandem zugewiesen sind (zugewiesen_an IS NULL) werden auto-geschlossen.
 * - Tasks die einem Menschen zugewiesen sind, BLEIBEN OFFEN — der Bearbeiter
 *   wird stattdessen via Hinweis-Banner am Task informiert (auto_resolved_grund
 *   wird gesetzt, status bleibt 'offen' damit der Bearbeiter manuell entscheidet).
 * - Niemals auf Verdacht oder Timeout schliessen — das machen separate Frist-Crons.
 *
 * Caller's Verantwortung: Diese Funktion nur in Erfolgs-Pfaden aufrufen
 * (z.B. nach Stripe Webhook bezahlt, nach Reklamation entschieden, etc.).
 */
export async function resolveTasksForEntity(
  entity_type: TaskEntityType,
  entity_id: string,
  resolve_grund: string,
): Promise<ResolveResult> {
  const db = createAdminClient()

  // 1. Lade alle offenen Tasks zu dieser Entitaet
  const { data: tasks, error: loadErr } = await db
    .from('tasks')
    .select('id, titel, fall_id, zugewiesen_an, auto_resolved_am')
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .eq('status', 'offen')

  if (loadErr) {
    console.error(`[KFZ-151] resolveTasksForEntity load: ${loadErr.message}`)
    return { resolved_count: 0, notified_count: 0, task_ids: [] }
  }

  if (!tasks?.length) {
    return { resolved_count: 0, notified_count: 0, task_ids: [] }
  }

  // 2. Trennung: ohne assignee → auto-close, mit assignee → nur markieren
  const autoClose = tasks.filter(t => !t.zugewiesen_an)
  const assigned = tasks.filter(t => t.zugewiesen_an)

  const nowIso = new Date().toISOString()
  const closedIds: string[] = []

  // 3. Auto-Close fuer Tasks ohne assignee
  if (autoClose.length > 0) {
    const ids = autoClose.map(t => t.id)
    const { error: updateErr } = await db
      .from('tasks')
      .update({
        status: 'erledigt',
        erledigt_am: nowIso,
        auto_resolved_am: nowIso,
        auto_resolved_grund: resolve_grund,
      })
      .in('id', ids)

    if (updateErr) {
      console.error(`[KFZ-151] resolveTasksForEntity auto-close: ${updateErr.message}`)
    } else {
      closedIds.push(...ids)
    }
  }

  // 4. Assignee-Tasks: nur Hinweis setzen (status BLEIBT offen)
  // Bearbeiter sieht den Hinweis im Admin-UI und entscheidet selbst.
  if (assigned.length > 0) {
    const ids = assigned.map(t => t.id)
    const { error: notifyErr } = await db
      .from('tasks')
      .update({
        auto_resolved_am: nowIso,
        auto_resolved_grund: resolve_grund,
      })
      .in('id', ids)

    if (notifyErr) {
      console.error(`[KFZ-151] resolveTasksForEntity notify-assigned: ${notifyErr.message}`)
    }
  }

  // 5. Audit-Eintrag in timeline (falls Tasks an einen Fall haengen)
  // timeline ist die naechstgelegene Audit-Tabelle im System.
  const fallIds = Array.from(new Set(tasks.map(t => t.fall_id).filter((x): x is string => !!x)))
  for (const fallId of fallIds) {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `${closedIds.length} Task(s) auto-resolved`,
      beschreibung: `Entity ${entity_type}:${entity_id} erledigt → ${closedIds.length} Task(s) automatisch geschlossen, ${assigned.length} mit Hinweis markiert. Grund: ${resolve_grund}`,
    })
  }

  return {
    resolved_count: closedIds.length,
    notified_count: assigned.length,
    task_ids: closedIds,
  }
}
