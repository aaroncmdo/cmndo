'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getGutachterForUser } from '@/lib/gutachter'

// KFZ-182: SV sendet Chat-Nachricht aus Gutachter-Inbox.

export async function sendNachrichtFromSvInbox(
  fallId: string,
  nachricht: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Nicht autorisiert' }
  const { data: fall } = await supabase.from('faelle').select('id').eq('id', fallId).eq('sv_id', sv.id).maybeSingle()
  if (!fall) return { success: false, error: 'Nicht autorisiert' }

  const { error: insertErr } = await supabase.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'portal-kunde-gutachter',
    sender_id: user.id,
    sender_rolle: 'gutachter',
    nachricht: nachricht.trim(),
    richtung: 'outbound',
  })
  if (insertErr) return { success: false, error: insertErr.message }

  revalidatePath('/gutachter/nachrichten', 'page')
  return { success: true }
}
