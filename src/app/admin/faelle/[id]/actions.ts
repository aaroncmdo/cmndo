'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveFilmcheck(fallId: string, notizen: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('faelle')
    .update({
      filmcheck_ok: true,
      filmcheck_am: new Date().toISOString(),
      filmcheck_notizen: notizen || null,
      status: 'kanzlei-uebergeben',
    })
    .eq('id', fallId)

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
}
