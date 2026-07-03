import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mappt einen Termin-assignee auf das profile_id, dem die Kalender-Verbindung gehört.
 * - sachverstaendiger: assignee_id = sachverstaendige.id → profile_id (join).
 * - kundenbetreuer:   assignee_id ist bereits die profiles.id.
 * - kanzlei/werkstatt: in SP3/SP4 ergänzen — bis dahin null (= Provider-skip, kein Fehler).
 */
export async function resolveAssigneeProfileId(
  db: SupabaseClient,
  assigneeTyp: string | null,
  assigneeId: string | null,
): Promise<string | null> {
  if (!assigneeTyp || !assigneeId) return null
  if (assigneeTyp === 'kundenbetreuer') return assigneeId
  if (assigneeTyp === 'sachverstaendiger') {
    const { data } = await db.from('sachverstaendige').select('profile_id').eq('id', assigneeId).maybeSingle()
    return (data?.profile_id as string | null) ?? null
  }
  return null
}
