'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { emailFilmcheckBestanden } from '@/lib/email'

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

  // E-Mail an Kanzlei: Filmcheck bestanden
  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer').eq('id', fallId).single()
  const fallNr = fallInfo?.fall_nummer ?? fallId.slice(0, 8)
  const { data: kanzleiUsers } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
  for (const k of kanzleiUsers ?? []) {
    if (k.email) emailFilmcheckBestanden(k.email, fallNr).catch(() => {})
  }

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
