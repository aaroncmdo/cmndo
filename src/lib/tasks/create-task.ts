'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { TaskEntityType, TaskPrioritaet } from './types'

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

  const { data, error } = await db.from('tasks').insert({
    fall_id: params.fall_id ?? null,
    typ: params.typ ?? params.entity_type ?? 'allgemein',
    titel: params.titel,
    beschreibung: params.beschreibung ?? null,
    status: 'offen',
    prioritaet: params.prioritaet ?? 'normal',
    zugewiesen_an: params.zugewiesen_an ?? null,
    empfaenger_rolle: params.empfaenger_rolle ?? null,
    empfaenger_user_id: params.empfaenger_user_id ?? null,
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

  return { task_id: data?.id ?? null }
}
