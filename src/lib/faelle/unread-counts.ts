import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// KFZ-182 Phase D: Unread-Counts pro Fall pro User.

export type UnreadCounts = {
  chatCount: number
  updateCount: number
}

export async function getUnreadCounts(fallId: string, userId: string): Promise<UnreadCounts> {
  const db = createAdminClient()

  const { data: state } = await db.from('fall_read_state')
    .select('last_read_chat_at, last_read_update_at')
    .eq('user_id', userId)
    .eq('fall_id', fallId)
    .maybeSingle()

  const lastReadChat = state?.last_read_chat_at ?? '1970-01-01T00:00:00Z'
  const lastReadUpdate = state?.last_read_update_at ?? '1970-01-01T00:00:00Z'

  const { count: chatCount } = await db.from('nachrichten')
    .select('*', { count: 'exact', head: true })
    .eq('fall_id', fallId)
    .gt('created_at', lastReadChat)
    .neq('sender_rolle', 'system')

  const { data: updateCountRow } = await db.rpc('count_unread_updates', {
    p_fall_id: fallId,
    p_since: lastReadUpdate,
  })

  return {
    chatCount: chatCount ?? 0,
    updateCount: typeof updateCountRow === 'number' ? updateCountRow : 0,
  }
}

export async function getUnreadCountsBatch(
  fallIds: string[],
  userId: string,
): Promise<Record<string, UnreadCounts>> {
  if (fallIds.length === 0) return {}
  const db = createAdminClient()

  // Load all read states at once
  const { data: states } = await db.from('fall_read_state')
    .select('fall_id, last_read_chat_at, last_read_update_at')
    .eq('user_id', userId)
    .in('fall_id', fallIds)

  const stateMap = new Map<string, { chat: string; update: string }>()
  for (const s of states ?? []) {
    stateMap.set(s.fall_id, { chat: s.last_read_chat_at, update: s.last_read_update_at })
  }

  const result: Record<string, UnreadCounts> = {}
  const defaultTime = '1970-01-01T00:00:00Z'

  // Batch: count unread chats per fall
  for (const fid of fallIds) {
    const st = stateMap.get(fid)
    const { count: chatCount } = await db.from('nachrichten')
      .select('*', { count: 'exact', head: true })
      .eq('fall_id', fid)
      .gt('created_at', st?.chat ?? defaultTime)
      .neq('sender_rolle', 'system')

    const { data: updateCount } = await db.rpc('count_unread_updates', {
      p_fall_id: fid,
      p_since: st?.update ?? defaultTime,
    })

    result[fid] = {
      chatCount: chatCount ?? 0,
      updateCount: typeof updateCount === 'number' ? updateCount : 0,
    }
  }

  return result
}

export async function markFallAsRead(
  fallId: string,
  userId: string,
  type: 'chat' | 'update' | 'both' = 'both',
): Promise<void> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const update: Record<string, unknown> = { updated_at: now }
  if (type === 'chat' || type === 'both') update.last_read_chat_at = now
  if (type === 'update' || type === 'both') update.last_read_update_at = now

  await supabase.from('fall_read_state').upsert({
    user_id: userId,
    fall_id: fallId,
    ...update,
  }, { onConflict: 'user_id,fall_id' })
}
