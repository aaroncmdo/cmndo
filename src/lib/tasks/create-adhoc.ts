'use server'

// AAR-307: Ad-hoc Task-Creation für KB/SV/Admin. Wird aus der Fallakte
// gestartet, nicht automatisiert. RLS-Check zusätzlich auf DB-Level:
// - Admin + KB/LB/Dispatch → Mitarbeiter-Policy (is_staff)
// - SV → neue sv_adhoc_task_insert-Policy (nur eigene Fälle)

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type EntityType = 'kunde' | 'sachverstaendiger' | 'kanzlei' | 'versicherung'
export type EmpfaengerRolle =
  | 'dispatch'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kanzlei'
  | 'admin'

export type CreateAdHocTaskInput = {
  fallId: string
  titel: string
  beschreibung?: string
  empfaengerRolle: EmpfaengerRolle
  empfaengerUserId?: string
  deadline?: string
  prioritaet?: 'niedrig' | 'normal' | 'hoch'
  entityType?: EntityType
  entityId?: string
}

export async function createAdHocTask(
  input: CreateAdHocTaskInput,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!rolle || !['kundenbetreuer', 'sachverstaendiger', 'admin'].includes(rolle)) {
    return { ok: false, error: 'Keine Berechtigung Tasks anzulegen' }
  }

  if (!input.titel.trim()) return { ok: false, error: 'Titel ist erforderlich' }
  if (input.titel.length > 200) return { ok: false, error: 'Titel zu lang (max 200 Zeichen)' }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      fall_id: input.fallId,
      typ: 'adhoc',
      task_typ: 'adhoc-manuell',
      titel: input.titel.trim(),
      beschreibung: input.beschreibung?.trim() || null,
      status: 'offen',
      empfaenger_rolle: input.empfaengerRolle,
      empfaenger_user_id: input.empfaengerUserId || null,
      zugewiesen_an: input.empfaengerUserId || null,
      deadline: input.deadline || null,
      faellig_am: input.deadline || null,
      prioritaet: input.prioritaet || 'normal',
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      auto_erstellt: false,
      erstellt_von_id: user.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Task konnte nicht angelegt werden' }

  revalidatePath(`/gutachter/fall/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}`)
  return { ok: true, taskId: data.id }
}
