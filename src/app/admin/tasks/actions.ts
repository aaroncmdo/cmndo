'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logFallEvent } from '@/lib/fall/log-event'
import { requireRole } from '@/lib/auth/guards'

export async function createTask(formData: FormData) {
  // Audit 2026-05-06: requireRole war importiert aber nicht aufgerufen —
  // jeder authentifizierte User konnte Tasks fuer beliebige Faelle anlegen,
  // Layout-Guard schuetzte nur die UI nicht die Action selber.
  await requireRole(['admin'])

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const fallId = formData.get('fall_id') as string
  const typ = formData.get('typ') as string
  const titel = formData.get('titel') as string
  const beschreibung = (formData.get('beschreibung') as string) || null
  const faelligAm = (formData.get('faellig_am') as string) || null
  const zugewiesenAn = (formData.get('zugewiesen_an') as string) || null

  if (!fallId || !typ || !titel) {
    throw new Error('Fall, Typ und Titel sind Pflichtfelder')
  }

  const { error } = await supabase.from('tasks').insert({
    fall_id: fallId,
    typ,
    titel,
    beschreibung,
    faellig_am: faelligAm || null,
    zugewiesen_an: zugewiesenAn || null,
    status: 'offen',
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/aufgaben/alle')
}

export async function updateTaskStatus(taskId: string, newStatus: string) {
  // Audit-Fix #6: Rollen-Check ergaenzt — vorher konnten kunde/sv die Action
  // direkt aufrufen und beliebige Tasks erledigen/zurueckziehen.
  await requireRole(['admin'])

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // AAR-713 Phase 2: Core-Logik (DB-Update + erledigt_am-Reset + Gate-Resolve)
  // aus shared lib/tasks/update-status-core.ts. Vorher dupliziert in
  // faelle/[id]/_actions/tasks.ts mit leicht abweichender Logik —
  // admin-Pfad setzte erledigt_am beim Reopen NICHT auf null und triggerte
  // resolveGates nicht. Jetzt einheitlich.
  const { updateTaskStatusCore } = await import('@/lib/tasks/update-status-core')
  const result = await updateTaskStatusCore(supabase, taskId, newStatus)

  // Admin-spezifischer Side-Effect: Auto-Follow-up filmcheck → kanzlei-anschlussschreiben.
  if (newStatus === 'erledigt' && result.typ === 'filmcheck' && result.fallId) {
    await supabase.from('tasks').insert({
      fall_id: result.fallId,
      typ: 'kanzlei-anschlussschreiben',
      titel: 'Anschlussschreiben an Kanzlei senden',
      beschreibung: 'Automatisch erstellt nach abgeschlossenem Filmcheck.',
      status: 'offen',
    })
  }

  revalidatePath('/admin/aufgaben/alle')
}

export async function deleteTask(taskId: string) {
  // Audit-Fix #6: Rollen-Check ergaenzt.
  await requireRole(['admin'])

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/aufgaben/alle')
}

// AAR-723: Task an Kollegen weiterleiten. Setzt zugewiesen_an +
// empfaenger_user_id neu, schreibt Timeline-Eintrag falls der Task an einen
// Fall hängt. Nur Admins dürfen umleiten — Rollen-Check über profiles.rolle.
export async function reassignTask(taskId: string, neuerUserId: string) {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { success: false, error: guard.error }
  const { supabase, user } = guard

  if (!taskId || !neuerUserId) {
    return { success: false, error: 'Task und Ziel-User sind Pflicht' }
  }

  const { data: task } = await supabase
    .from('tasks')
    .select('id, fall_id, zugewiesen_an, titel')
    .eq('id', taskId)
    .maybeSingle()
  if (!task) return { success: false, error: 'Task nicht gefunden' }

  const { data: zielProfile } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, rolle')
    .eq('id', neuerUserId)
    .maybeSingle()
  if (!zielProfile) return { success: false, error: 'Ziel-User nicht gefunden' }

  const { error: updateErr } = await supabase
    .from('tasks')
    .update({
      zugewiesen_an: neuerUserId,
      empfaenger_user_id: neuerUserId,
      empfaenger_rolle: zielProfile.rolle,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (updateErr) return { success: false, error: updateErr.message }

  if (task.fall_id) {
    const zielName = [zielProfile.vorname, zielProfile.nachname].filter(Boolean).join(' ') || 'Unbekannt'
    await logFallEvent(supabase, {
      fallId: task.fall_id,
      typ: 'task',
      titel: `Task weitergeleitet: ${task.titel}`,
      beschreibung: `Manuell weitergeleitet an ${zielName}.`,
      actor: user.id,
    })
  }

  revalidatePath('/admin/aufgaben/alle')
  revalidatePath('/admin/meine-tasks')
  return { success: true }
}
