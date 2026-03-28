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

  // Auto-create follow-up task: Anschlussschreiben an Kanzlei
  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'kanzlei-anschlussschreiben',
    titel: 'Anschlussschreiben an Kanzlei senden',
    beschreibung: 'Automatisch erstellt nach abgeschlossenem Filmcheck.',
    status: 'offen',
  })

  revalidatePath(`/admin/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  revalidatePath('/admin/tasks')
}
