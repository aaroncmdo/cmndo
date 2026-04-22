'use server'

// AAR-381: Server-Action-Wrapper für „Tagesroute starten".
// Delegiert an Foundation-Lib `ensureTagesSession`.

import { createClient } from '@/lib/supabase/server'
import { ensureTagesSession } from '@/lib/sv/tages-session'

export async function startOrResumeTagesSession(
  terminIds: string[],
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'unauthorized' }

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!sv?.id) return { success: false, error: 'no_sv' }

  if (terminIds.length === 0) {
    return { success: false, error: 'Keine Termine für heute gefunden.' }
  }

  const today = new Date()
  const session = await ensureTagesSession(sv.id, today, terminIds)
  if (!session) {
    // AAR-707: Detail steckt im Server-Log (siehe ensureTagesSession).
    // User-facing-Hinweis statt nur 'create_failed'.
    return {
      success: false,
      error: 'Tagesroute konnte nicht angelegt werden. Bitte später nochmal versuchen oder Server-Log prüfen.',
    }
  }

  return { success: true, sessionId: session.id }
}
