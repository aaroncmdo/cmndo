// Audit-Dedup 04.08.: EIN Writer fuer community_profiles.is_blocked — ersetzt
// die identischen blockUser-Bodies in admin/community + admin/kommentare.
// Auth + revalidatePath bleiben beim Caller (je eigener Pfad).
import { createAdminClient } from '@/lib/supabase/admin'

export async function blockCommunityUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('community_profiles')
    .update({ is_blocked: true })
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
