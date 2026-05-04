'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markReviewPromptGezeigt(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('faelle')
    .update({ google_review_prompt_gezeigt_am: new Date().toISOString() })
    .eq('id', fallId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/faelle/${fallId}`)
  return { ok: true }
}
