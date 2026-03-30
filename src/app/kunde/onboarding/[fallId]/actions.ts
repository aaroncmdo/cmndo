'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadPflichtdokument(
  fallId: string,
  pflichtdokumentId: string,
  formData: FormData
): Promise<{ dateiUrl: string; dateiName: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Verify ownership
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, kunde_id')
    .eq('id', fallId)
    .single()

  if (!fall || fall.kunde_id !== user.id) {
    throw new Error('Kein Zugriff')
  }

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewaehlt')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `kunde/${fallId}/onboarding/${pflichtdokumentId}_${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('dokumente')
    .upload(path, file)

  if (uploadErr) throw new Error(uploadErr.message)

  const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)

  // Update pflichtdokument record
  const { error: updateErr } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'hochgeladen',
      datei_url: urlData.publicUrl,
      datei_name: file.name,
      datei_groesse: file.size,
    })
    .eq('id', pflichtdokumentId)

  if (updateErr) throw new Error(updateErr.message)

  // Also create a dokumente entry for consistency
  await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: 'kunde-nachreichung',
    datei_url: urlData.publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
  })

  revalidatePath(`/kunde/onboarding/${fallId}`)

  return { dateiUrl: urlData.publicUrl, dateiName: file.name }
}

export async function completeOnboarding(fallId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Verify ownership
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, kunde_id')
    .eq('id', fallId)
    .single()

  if (!fall || fall.kunde_id !== user.id) {
    throw new Error('Kein Zugriff')
  }

  // Verify all pflicht documents are uploaded
  const { data: pending } = await supabase
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .eq('pflicht', true)
    .eq('status', 'ausstehend')

  if (pending && pending.length > 0) {
    throw new Error('Es gibt noch ausstehende Pflichtdokumente')
  }

  // Mark onboarding as complete
  const { error } = await supabase
    .from('faelle')
    .update({ onboarding_complete: true })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  revalidatePath('/kunde')
}
