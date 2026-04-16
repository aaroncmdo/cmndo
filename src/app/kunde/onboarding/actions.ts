'use server'

// AAR-100: Kunden-Portal Onboarding Server Actions
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  // AAR-228 Bug 2: faelle.onboarding_complete MUSS synchron gesetzt werden —
  // sonst sieht /kunde/page.tsx weiter onboarding_complete=false → Redirect-Loop.
  // Admin-Client weil Kunde keine direkte Update-Policy auf faelle hat.
  const admin = createAdminClient()
  await admin.from('faelle')
    .update({ onboarding_complete: true })
    .eq('kunde_id', user.id)
    .is('onboarding_complete', false)

  revalidatePath('/kunde')
  return { success: true }
}

/**
 * Upload eines Pflichtdokuments durch den Kunden.
 * Speichert File in Storage, legt fall_dokumente-Eintrag an und
 * markiert pflichtdokument als hochgeladen.
 */
export async function uploadPflichtdokument(
  pflichtdokumentId: string,
  fallId: string,
  fileBase64: string,
  fileName: string,
  contentType: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Ownership-Check: gehoert der Fall diesem Kunden?
  const { data: fall } = await supabase.from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) {
    return { success: false, error: 'Fall nicht zugeordnet' }
  }

  // Storage Upload via Admin
  const admin = createAdminClient()
  const ts = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `kunde-uploads/${user.id}/${fallId}/${ts}_${safeName}`

  try {
    const buffer = Buffer.from(fileBase64.split(',').pop() ?? fileBase64, 'base64')
    const { error: upErr } = await admin.storage
      .from('dokumente')
      .upload(path, buffer, { contentType, upsert: false })
    if (upErr) return { success: false, error: upErr.message }

    const { data: { publicUrl } } = admin.storage.from('dokumente').getPublicUrl(path)

    // Pflichtdokument aktualisieren
    await admin.from('pflichtdokumente').update({
      status: 'hochgeladen',
      dokument_url: publicUrl,
      hochgeladen_am: new Date().toISOString(),
    }).eq('id', pflichtdokumentId)

    // fall_dokumente-Eintrag
    await admin.from('fall_dokumente').insert({
      fall_id: fallId,
      typ: 'kunde-upload',
      kategorie: 'kundendokument',
      datei_url: publicUrl,
      datei_name: fileName,
      quelle: 'kunde-onboarding',
      hochgeladen_von_rolle: 'kunde',
      sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
    })

    revalidatePath('/kunde/onboarding')
    return { success: true, url: publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
