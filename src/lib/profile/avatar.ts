'use server'

// AAR-369: Upload/Remove für das eigene Profilbild.
// Pfad-Konvention: avatare/{userId}/avatar.{ext}
// Public-Bucket — die URL wird in profiles.avatar_url gespeichert.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

type Result = { success: true; avatarUrl: string } | { success: false; error: string }

export async function uploadAvatar(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  const file = formData.get('avatar')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Keine Datei übergeben' }
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { success: false, error: 'Nur JPEG, PNG oder WebP erlaubt' }
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'Bild zu groß (max 5 MB)' }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const { error: upErr } = await supabase.storage
    .from('avatare')
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: '3600' })
  if (upErr) return { success: false, error: upErr.message }

  const { data: urlData } = supabase.storage.from('avatare').getPublicUrl(path)
  // Cache-Buster, damit alter Cache nach Re-Upload ignoriert wird
  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)
  if (profErr) return { success: false, error: profErr.message }

  revalidatePath('/', 'layout')
  return { success: true, avatarUrl }
}

export async function removeAvatar(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  // Best-effort: Alle Varianten im eigenen Folder entfernen
  const { data: list } = await supabase.storage.from('avatare').list(user.id)
  if (list && list.length > 0) {
    await supabase.storage
      .from('avatare')
      .remove(list.map(f => `${user.id}/${f.name}`))
  }

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id)
  if (profErr) return { success: false, error: profErr.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updateProfilText(
  anzeigename: string | null,
  profilbeschreibung: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('profiles')
    .update({
      anzeigename: anzeigename?.trim() || null,
      profilbeschreibung: profilbeschreibung?.trim() || null,
    })
    .eq('id', user.id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}
