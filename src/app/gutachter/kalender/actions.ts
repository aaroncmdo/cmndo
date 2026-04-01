'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setTermin(fallId: string, termin: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({ sv_termin: termin, status: 'sv-termin' })
    .eq('id', fallId)

  if (error) throw new Error(error.message)
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
}
