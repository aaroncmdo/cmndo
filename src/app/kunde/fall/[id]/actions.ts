'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadDokument(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewählt')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `kunde/${fallId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('dokumente')
    .upload(path, file)

  if (uploadErr) throw new Error(uploadErr.message)

  const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)

  const { error: insertErr } = await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: 'kunde-nachreichung',
    datei_url: urlData.publicUrl,
    datei_name: file.name,
  })

  if (insertErr) throw new Error(insertErr.message)
  revalidatePath(`/kunde/fall/${fallId}`)
}

export async function sendNachricht(fallId: string, nachricht: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  if (!nachricht.trim()) throw new Error('Nachricht darf nicht leer sein')

  const { error } = await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'kunde-nachricht',
    titel: 'Nachricht vom Kunden',
    beschreibung: nachricht.trim(),
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/kunde/fall/${fallId}`)
}
