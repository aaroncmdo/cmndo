'use server'

import { markFallAsRead } from './unread-counts'
import { createClient } from '@/lib/supabase/server'

// KFZ-182: Server action wrapper for markFallAsRead.

export async function markFallAsReadAction(fallId: string): Promise<void> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return
  await markFallAsRead(fallId, user.id, 'both')
}
