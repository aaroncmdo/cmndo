// AAR-764 Phase 2: Eskalations-Cron.
//
// Durchläuft alle Tasks die via Resolver (trigger_event gesetzt) erstellt
// wurden, zählt wie viele Reminder bereits versendet wurden und prüft gegen
// die Eskalations-Spec aus event-to-task-map.ts. Wenn Threshold überschritten
// UND Original-Task noch offen → Eskalations-Task für die höhere Rolle
// erstellen + Original als `eskaliert_am` markieren.
//
// Wird aus `/api/cron/task-eskalation` aufgerufen (separater Cron, damit
// die Task-Reminder-Route unberührt bleibt).

import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { EVENT_TO_TASK } from './event-to-task-map'
import type { EventType } from '@/lib/notifications/types'

export type EskalationsResult = {
  checked: number
  eskaliert: number
  task_ids: string[]
  errors: string[]
}

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback
  return String(v)
}

function expandTemplate(
  template: string,
  ctx: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => ctx[key] ?? m)
}

export async function runEskalationsCron(): Promise<EskalationsResult> {
  const db = createAdminClient()
  const result: EskalationsResult = {
    checked: 0,
    eskaliert: 0,
    task_ids: [],
    errors: [],
  }

  // Alle auto-erstellten Tasks mit trigger_event die noch offen sind und
  // noch nicht eskaliert wurden.
  const { data: tasks, error } = await db
    .from('tasks')
    .select('id, titel, trigger_event, fall_id, faellig_am, status, empfaenger_rolle, eskaliert_am')
    .eq('auto_erstellt', true)
    .eq('status', 'offen')
    .not('trigger_event', 'is', null)
    .is('eskaliert_am', null)
    .limit(500)

  if (error) {
    result.errors.push(`Query tasks: ${error.message}`)
    return result
  }
  if (!tasks?.length) return result

  result.checked = tasks.length

  for (const task of tasks) {
    try {
      const eventType = task.trigger_event as EventType
      const specs = EVENT_TO_TASK[eventType]
      if (!specs || specs.length === 0) continue

      // Erste Spec mit Eskalations-Config für diese Rolle finden
      const spec = specs.find(
        (s) =>
          s.empfaenger_rolle === task.empfaenger_rolle && s.eskalation !== undefined,
      )
      if (!spec || !spec.eskalation) continue

      // Anzahl gesendeter Reminder zählen
      const { count: sentCount } = await db
        .from('task_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', task.id)
        .eq('status', 'sent')

      if ((sentCount ?? 0) < spec.eskalation.nach_stillen_remindern) continue

      // Fall-Kontext für Template-Expand
      let fallNummer = task.fall_id ? String(task.fall_id).slice(0, 8) : '—'
      if (task.fall_id) {
        const { data: fall } = await db
          .from('faelle')
          .select('claims:claim_id(claim_nummer)')
          .eq('id', task.fall_id)
          .maybeSingle()
        const fallClaimNummer =
          (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? null
        if (fallClaimNummer) fallNummer = fallClaimNummer
      }

      const ctx: Record<string, string> = {
        claim_nummer: fallNummer,
        original_titel: str(task.titel),
      }

      const eskalationsTitel = expandTemplate(spec.eskalation.titel_template, ctx)
      const faelligAm = new Date(Date.now() + 4 * 3600 * 1000) // Default: 4h für Eskalation

      const { task_id } = await createLinkedTask({
        titel: eskalationsTitel,
        beschreibung:
          `Eskaliert aus Task: ${str(task.titel)}\n` +
          `Ursprüngliches Event: ${eventType}\n` +
          `Reminder versendet: ${sentCount}`,
        prioritaet: spec.eskalation.prioritaet ?? 'dringend',
        empfaenger_rolle: spec.eskalation.an_rolle,
        typ: `eskalation_${spec.task_typ}`,
        fall_id: task.fall_id,
        faellig_am: faelligAm,
        trigger_event: eventType,
        auto_erstellt: true,
      })

      if (task_id) {
        // Original-Task als eskaliert markieren
        await db
          .from('tasks')
          .update({ eskaliert_am: new Date().toISOString() })
          .eq('id', task.id)

        result.task_ids.push(task_id)
        result.eskaliert++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Task ${task.id}: ${msg}`)
    }
  }

  return result
}
