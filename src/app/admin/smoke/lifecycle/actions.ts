'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { seedAllScenarios, resetAllScenarios } from '@/lib/smoke/lifecycle-seed'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  if (!profile || profile.rolle !== 'admin') redirect('/login')
}

// Form-Actions liefern void zurueck — die Ergebnisse landen im
// Console-Log. Falls die UI sie braucht, koennen wir sie spaeter ueber
// useFormState einsammeln; fuer dieses Smoke-Tool reicht der Server-Log.
export async function seedAction(): Promise<void> {
  await requireAdmin()
  const result = await seedAllScenarios()
  if (!result.ok) console.error('[smoke seedAction]', result.error)
  else console.log('[smoke seedAction]', result.rows.length, 'Szenarien angelegt')
  revalidatePath('/admin/smoke/lifecycle')
}

export async function resetAction(): Promise<void> {
  await requireAdmin()
  const result = await resetAllScenarios()
  if (!result.ok) console.error('[smoke resetAction]', result.error)
  else console.log('[smoke resetAction]', result.geloescht, 'Smoke-Claims geloescht')
  revalidatePath('/admin/smoke/lifecycle')
}
