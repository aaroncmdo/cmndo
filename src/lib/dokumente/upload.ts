'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// KFZ-172 Phase 2: Upload-Server-Action fuer Fall-Dokumente.
// Speichert in Supabase Storage Bucket 'fall-dokumente' und erstellt
// einen Eintrag in fall_dokumente mit ocr_status='pending'.

export async function uploadFallDokument(
  fallId: string,
  dokumentTyp: string,
  istPflicht: boolean,
  abPhase: string | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string; dokumentId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'Keine Datei' }

  // Validierung
  const maxSize = 10 * 1024 * 1024 // 10 MB
  if (file.size > maxSize) return { success: false, error: 'Datei zu groß (max 10 MB)' }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Nur JPG, PNG, WebP oder PDF erlaubt' }
  }

  // Storage Path
  const ext = file.name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `${fallId}/${dokumentTyp}_${timestamp}.${ext}`

  // Upload in Storage
  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    // Falls Bucket noch nicht existiert: graceful error
    return { success: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }
  }

  // DB-Eintrag
  const { data: row, error: insertErr } = await supabase
    .from('fall_dokumente')
    .insert({
      fall_id: fallId,
      dokument_typ: dokumentTyp,
      ist_pflicht: istPflicht,
      ab_phase: abPhase,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      groesse_bytes: file.size,
      ocr_status: file.type === 'application/pdf' || file.type.startsWith('image/') ? 'pending' : 'skipped',
      hochgeladen_von_user_id: user.id,
    })
    .select('id')
    .single()

  if (insertErr || !row) {
    return { success: false, error: `DB-Eintrag fehlgeschlagen: ${insertErr?.message}` }
  }

  revalidatePath(`/faelle/${fallId}`, 'page')
  revalidatePath(`/gutachter/fall/${fallId}`, 'page')

  // KFZ-172 Phase 3: OCR triggern (fire & forget, async)
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
    fetch(`${baseUrl}/api/ocr-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dokument_id: row.id }),
    }).catch(() => {})
  }

  return { success: true, dokumentId: row.id }
}

export async function deleteFallDokument(
  dokumentId: string,
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('fall_dokumente')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', dokumentId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`, 'page')
  revalidatePath(`/gutachter/fall/${fallId}`, 'page')

  return { success: true }
}
