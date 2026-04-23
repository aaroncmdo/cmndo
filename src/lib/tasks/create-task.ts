'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskEntityType, TaskPrioritaet } from './types'
import { generateReminderForTask } from './reminder-generator'
import { chooseAssigneeForRolle } from './auto-assign'
import { logFallEvent } from '@/lib/fall/log-event'

type CreateLinkedTaskParams = {
  titel: string
  beschreibung?: string
  prioritaet?: TaskPrioritaet
  zugewiesen_an?: string | null
  entity_type?: TaskEntityType
  entity_id?: string
  faellig_am?: Date | string
  fall_id?: string | null
  typ?: string
  empfaenger_rolle?: string
  empfaenger_user_id?: string | null
  phase?: string
  task_code?: string
  trigger_event?: string
  auto_erstellt?: boolean
}

/**
 * KFZ-151: Standard-Helper fuer alle automatisch erzeugten Tasks.
 *
 * Setzt automatisch entity_type/entity_id damit der zentrale Resolver
 * den Task spaeter auto-schliessen kann sobald die zugehoerige Sache
 * nachweislich erledigt ist.
 *
 * Wenn nur fall_id mitkommt aber kein entity_type/entity_id, wird der Task
 * implizit als entity_type='fall' verknuepft (rueckwaerts-kompatibel zu den
 * autoCompleteTask-Regeln aus tasking.ts).
 */
export async function createLinkedTask(params: CreateLinkedTaskParams): Promise<{ task_id: string | null }> {
  const db = createAdminClient()

  // Implizite entity_type=fall Verknuepfung wenn nur fall_id mitkommt
  let entityType = params.entity_type
  let entityId = params.entity_id
  if (!entityType && params.fall_id) {
    entityType = 'fall'
    entityId = params.fall_id
  }

  const faelligAmIso = params.faellig_am
    ? (typeof params.faellig_am === 'string' ? params.faellig_am : params.faellig_am.toISOString())
    : null

  // AAR-723: Auto-Assign. Wenn die Rolle gesetzt ist aber kein konkreter
  // Empfänger angegeben wurde, wählen wir hier den User mit den wenigsten
  // offenen Tasks dieser Rolle. So entsteht kein Broadcast-Pool ohne Owner
  // mehr — jeder Task hat einen eindeutigen Verantwortlichen.
  let autoAssignedUserId: string | null = null
  let autoAssignMeta: { rolle: string; fallback_reason: string | null; candidate_count: number } | null = null
  const hasExplicitAssignee = Boolean(params.zugewiesen_an || params.empfaenger_user_id)
  if (!hasExplicitAssignee && params.empfaenger_rolle) {
    const chosen = await chooseAssigneeForRolle(params.empfaenger_rolle)
    if (chosen) {
      autoAssignedUserId = chosen.user_id
      autoAssignMeta = {
        rolle: chosen.rolle,
        fallback_reason: chosen.fallback_reason,
        candidate_count: chosen.candidate_count,
      }
    }
  }

  const finalZugewiesenAn = params.zugewiesen_an ?? autoAssignedUserId ?? null
  const finalEmpfaengerUserId = params.empfaenger_user_id ?? autoAssignedUserId ?? null

  const { data, error } = await db.from('tasks').insert({
    fall_id: params.fall_id ?? null,
    typ: params.typ ?? params.entity_type ?? 'allgemein',
    titel: params.titel,
    beschreibung: params.beschreibung ?? null,
    status: 'offen',
    prioritaet: params.prioritaet ?? 'normal',
    zugewiesen_an: finalZugewiesenAn,
    empfaenger_rolle: params.empfaenger_rolle ?? null,
    empfaenger_user_id: finalEmpfaengerUserId,
    faellig_am: faelligAmIso,
    auto_erstellt: params.auto_erstellt ?? true,
    phase: params.phase ?? null,
    task_code: params.task_code ?? null,
    trigger_event: params.trigger_event ?? null,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
  }).select('id').single()

  if (error) {
    console.error(`[KFZ-151] createLinkedTask insert fehlgeschlagen: ${error.message}`)
    return { task_id: null }
  }

  // AAR-430: Reminder-Kaskade generieren (best-effort, non-blocking)
  if (data?.id && faelligAmIso) {
    try {
      await generateReminderForTask(data.id)
    } catch (err) {
      console.error('[AAR-430] generateReminderForTask (createLinkedTask) fehlgeschlagen:', err)
    }
  }

  // AAR-501 N6: task.created Event (nur bei bekanntem Empfänger + Fall)
  if (data?.id && finalEmpfaengerUserId && params.fall_id) {
    try {
      const { emitEvent } = await import('@/lib/notifications/emit')
      const rolle = (params.empfaenger_rolle ?? 'admin') as
        'kunde' | 'sachverstaendiger' | 'makler' | 'kundenbetreuer' | 'admin'
      await emitEvent(
        'task.created',
        {
          fallId: params.fall_id,
          taskId: data.id as string,
          taskTyp: params.typ ?? 'allgemein',
          empfaengerRolle: rolle,
          empfaengerUserId: finalEmpfaengerUserId,
          deadline: faelligAmIso ?? undefined,
        },
        { fallId: params.fall_id },
      )
    } catch (err) {
      console.error('[AAR-501] emitEvent task.created failed:', err)
    }
  }

  // AAR-229 W4: Mitteilung bei Task-Erstellung an den Empfänger.
  if (data?.id && finalEmpfaengerUserId) {
    // AAR-229 Audit: empfaenger_rolle kann admin/kundenbetreuer/dispatch/
    // sachverstaendiger/kanzlei/kunde sein — alle sind valide EmpfaengerRolle-
    // Werte für mitteilungen. Cast auf den Union-Type statt nur admin|SV.
    const rolleValue = (params.empfaenger_rolle ?? 'admin') as
      'admin' | 'dispatch' | 'kundenbetreuer' | 'sachverstaendiger' | 'kanzlei' | 'kunde'
    import('@/lib/mitteilungen/create-mitteilung')
      .then(({ createMitteilung }) => createMitteilung({
        empfaenger_id: finalEmpfaengerUserId,
        empfaenger_rolle: rolleValue,
        kategorie: 'task',
        titel: params.titel,
        inhalt: params.beschreibung ?? undefined,
        kontext_typ: 'fall',
        kontext_id: params.fall_id ?? undefined,
        prioritaet: params.prioritaet === 'kritisch' ? 'dringend' : 'normal',
      }))
      .catch(err => console.error('[AAR-229] createMitteilung fehlgeschlagen:', err))
  }

  // AAR-723: Timeline-Eintrag wenn Auto-Assign gegriffen hat. Macht die
  // Zuweisungs-Entscheidung in der Fallakte nachvollziehbar — inkl. Hinweis
  // auf Fallback-Konstellation (Rolle ohne aktive User).
  if (data?.id && autoAssignedUserId && autoAssignMeta && params.fall_id) {
    try {
      const { data: assigneeProfile } = await db
        .from('profiles')
        .select('vorname, nachname')
        .eq('id', autoAssignedUserId)
        .maybeSingle()
      const assigneeName = assigneeProfile
        ? [assigneeProfile.vorname, assigneeProfile.nachname].filter(Boolean).join(' ') || 'Unbekannt'
        : 'Unbekannt'
      const beschreibung = autoAssignMeta.fallback_reason
        ? `Automatisch zugewiesen an ${assigneeName} (${autoAssignMeta.rolle}) — Fallback: ${autoAssignMeta.fallback_reason}.`
        : `Automatisch zugewiesen an ${assigneeName} (Round-Robin, ${autoAssignMeta.candidate_count} Kandidaten in Rolle "${autoAssignMeta.rolle}").`
      await logFallEvent(db, {
        fallId: params.fall_id,
        typ: 'task',
        titel: `Task automatisch zugewiesen: ${params.titel}`,
        beschreibung,
      })
    } catch (err) {
      console.error('[AAR-723] Timeline-Eintrag Auto-Assign fehlgeschlagen:', err)
    }
  }

  return { task_id: data?.id ?? null }
}
