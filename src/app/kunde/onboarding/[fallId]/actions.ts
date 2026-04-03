'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function uploadPflichtdokument(
  fallId: string,
  pflichtdokumentId: string,
  formData: FormData
): Promise<{ dateiUrl: string; dateiName: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
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

export async function completeOnboarding(fallId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    // Verify ownership (via user-scoped client = RLS)
    const { data: fall } = await supabase
      .from('faelle')
      .select('id, kunde_id')
      .eq('id', fallId)
      .single()

    if (!fall || fall.kunde_id !== user.id) {
      return { success: false, error: 'Kein Zugriff' }
    }

    // BUG-59: Admin-Client fuer UPDATE (Kunde hat keine UPDATE-RLS auf faelle)
    const admin = createAdminClient()

    // Verify all pflicht documents are uploaded
    const { data: pending } = await admin
      .from('pflichtdokumente')
      .select('id')
      .eq('fall_id', fallId)
      .eq('pflicht', true)
      .eq('status', 'ausstehend')

    if (pending && pending.length > 0) {
      return { success: false, error: `Noch ${pending.length} Pflichtdokument(e) ausstehend` }
    }

    // Mark onboarding as complete
    const { error } = await admin
      .from('faelle')
      .update({ onboarding_complete: true, updated_at: new Date().toISOString() })
      .eq('id', fallId)

    if (error) return { success: false, error: error.message }

    // Timeline-Eintrag
    await admin.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'Onboarding abgeschlossen',
      beschreibung: 'Kunde hat das Onboarding abgeschlossen.',
      erstellt_von: user.id,
    }).catch(() => {})

    revalidatePath('/kunde')
    revalidatePath(`/kunde/onboarding/${fallId}`)
    return { success: true }
  } catch (err) {
    console.error('[completeOnboarding] Error:', err)
    return { success: false, error: String(err) }
  }
}
