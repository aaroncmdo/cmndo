'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markNachrichtenGelesen(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user || !fallId) return

  // Admin-Client fuer UPDATE (RLS koennte blocken)
  const admin = createAdminClient()
  const { error } = await admin
    .from('nachrichten')
    .update({ gelesen: true })
    .eq('fall_id', fallId)
    .eq('gelesen', false)
    .neq('sender_id', user.id)

  if (error) console.error('[markNachrichtenGelesen]', error.message)
}
