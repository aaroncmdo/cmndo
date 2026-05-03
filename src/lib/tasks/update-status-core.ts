// AAR-713 Phase 2 — Core Task-Status-Update als shared Helper.
//
// Vorher gab es zwei parallele Implementierungen:
//   - admin/tasks/actions.ts: ohne erledigt_am-Reset, ohne Gate-Resolve
//   - faelle/[id]/_actions/tasks.ts: mit Reset + resolveGates
// Drift-Risiko: Admin-User markiert Task als erledigt → reopen → erledigt_am
// blieb am alten Timestamp; gate-blocked Folge-Tasks blieben in admin-Pfad
// hängen.
//
// Dieser Helper unifiziert die DB-Logik. Side-Effects (revalidatePath,
// Auto-Follow-Up-Tasks) bleiben in den jeweiligen Route-actions.ts wo sie
// hingehören.

import type { SupabaseClient } from '@supabase/supabase-js'

export type UpdateTaskStatusResult = {
  taskId: string
  fallId: string | null
  typ: string | null
  prevStatus: string | null
  newStatus: string
}

/**
 * Aktualisiert tasks.status + setzt erledigt_am korrekt (Timestamp bei
 * 'erledigt', null sonst). Liefert die alten Werte zurück damit Caller
 * conditional-Side-Effects triggern können.
 *
 * Wirft bei DB-Fehler oder unbekanntem Task.
 */
export async function updateTaskStatusCore(
  supabase: SupabaseClient,
  taskId: string,
  newStatus: string,
): Promise<UpdateTaskStatusResult> {
  const { data: prev, error: loadErr } = await supabase
    .from('tasks')
    .select('id, fall_id, typ, status')
    .eq('id', taskId)
    .single()
  if (loadErr || !prev) throw new Error('Task nicht gefunden')

  const { error: updateErr } = await supabase
    .from('tasks')
    .update({
      status: newStatus,
      erledigt_am: newStatus === 'erledigt' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
  if (updateErr) throw new Error(updateErr.message)

  // Gate-Resolve auch im Admin-Pfad triggern damit blockierte Folge-Tasks
  // freigeschaltet werden — vorher nur in faelle-Pfad implementiert.
  if (newStatus === 'erledigt') {
    try {
      const { resolveGates } = await import('@/lib/tasking')
      await resolveGates(taskId)
    } catch (err) {
      console.warn('[updateTaskStatusCore] resolveGates:', err instanceof Error ? err.message : err)
    }
  }

  return {
    taskId,
    fallId: (prev.fall_id as string | null) ?? null,
    typ: (prev.typ as string | null) ?? null,
    prevStatus: (prev.status as string | null) ?? null,
    newStatus,
  }
}
