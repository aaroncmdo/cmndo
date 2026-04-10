'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getGutachterForUser } from '@/lib/gutachter'

export async function setTermin(fallId: string, termin: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein Sachverstaendiger gefunden')
  const { data: fall } = await supabase.from('faelle').select('id').eq('id', fallId).eq('sv_id', sv.id).maybeSingle()
  if (!fall) throw new Error('Nicht autorisiert')

  const { error } = await supabase
    .from('faelle')
    .update({ sv_termin: termin, status: 'sv-termin' })
    .eq('id', fallId)

  if (error) throw new Error(error.message)
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
}
