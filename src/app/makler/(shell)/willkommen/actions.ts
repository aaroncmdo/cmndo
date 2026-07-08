'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Makler-Aktivierung: markiert den Willkommens-Wizard als erledigt (Complete ODER Skip).
// Danach redirectet die Dashboard-Page (/makler) nicht mehr auf /makler/willkommen.
export async function markiereOnboardingAbgeschlossen(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { error } = await supabase
    .from('makler')
    .update({ onboarding_abgeschlossen: true })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/makler')
  return { ok: true }
}
