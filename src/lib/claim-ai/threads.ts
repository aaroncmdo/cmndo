// Konversations-Persistenz in der wiederbelebten ki_gespraeche (claim_id-keyed).
// Kein Unique-Index auf (claim_id,rolle,user_id) -> Read-modify-write.
import { createAdminClient } from '@/lib/supabase/admin'

export type ThreadMessage = { role: 'user' | 'assistant'; content: string; ts: string }

export async function loadThread(claimId: string, rolle: string, userId: string): Promise<ThreadMessage[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('ki_gespraeche')
    .select('nachrichten')
    .eq('claim_id', claimId)
    .eq('rolle', rolle)
    .eq('user_id', userId)
    .maybeSingle()
  return ((data?.nachrichten as ThreadMessage[] | undefined) ?? [])
}

export async function appendTurns(
  claimId: string,
  rolle: string,
  userId: string,
  neu: ThreadMessage[],
): Promise<void> {
  const db = createAdminClient()
  const { data } = await db
    .from('ki_gespraeche')
    .select('id, nachrichten')
    .eq('claim_id', claimId)
    .eq('rolle', rolle)
    .eq('user_id', userId)
    .maybeSingle()
  const nachrichten = [...((data?.nachrichten as ThreadMessage[] | undefined) ?? []), ...neu]
  if (data?.id) {
    const { error } = await db.from('ki_gespraeche').update({ nachrichten, updated_at: new Date().toISOString() }).eq('id', data.id)
    if (error) console.error('[claim-ai] thread update failed:', error.message)
  } else {
    const { error } = await db.from('ki_gespraeche').insert({ claim_id: claimId, rolle, user_id: userId, nachrichten })
    if (error) console.error('[claim-ai] thread insert failed:', error.message)
  }
}
