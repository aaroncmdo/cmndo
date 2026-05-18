'use server'

// CMM-44 SP-B PR2a: google_review_prompt_gezeigt_am lebt auf claims (SSoT).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function markReviewPromptGezeigt(
  fallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // claim_id des Falls holen, um auf claims zu schreiben.
  const { data: fallRow } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fallRow as { claim_id?: string | null } | null)?.claim_id ?? null

  if (!claimId) return { ok: false, error: 'Kein Claim für diesen Fall' }

  const { error } = await createAdminClient()
    .from('claims')
    .update({ google_review_prompt_gezeigt_am: new Date().toISOString() })
    .eq('id', claimId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/faelle/${fallId}`)
  return { ok: true }
}
