'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Makler „Erste-Vermittlung"-Prompt: markiert die einmalige Erfolgs-Card (passive Kanaele)
// als weggeklickt. Danach zeigt das Dashboard die Card nie wieder (vermittlung_prompt_gesehen).
// RLS: makler_self_update erlaubt dem Makler das Update der eigenen Row (wie
// markiereOnboardingAbgeschlossen).
export async function markiereVermittlungPromptGesehen(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { error } = await supabase
    .from('makler')
    .update({ vermittlung_prompt_gesehen: true })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/makler')
  return { ok: true }
}
