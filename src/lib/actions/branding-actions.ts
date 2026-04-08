'use server'

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'

async function requireGutachter() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein SV-Profil')
  return { supabase, userId: user.id, svId: sv.id }
}

export async function uploadGutachterLogo(formData: FormData): Promise<{
  logo_url: string
  primary: string
  secondary: string
}> {
  const { supabase, svId } = await requireGutachter()

  const file = formData.get('logo') as File
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewaehlt')
  if (file.size > 2 * 1024 * 1024) throw new Error('Datei zu gross (max 2 MB)')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) throw new Error('Nur PNG, JPG, SVG oder WebP erlaubt')

  const path = `${svId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage.from('gutachter-logos').upload(path, file, { contentType: file.type })
  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data: urlData } = supabase.storage.from('gutachter-logos').getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  // Color Extraction
  let primary = '#0D1B3E'
  let secondary = '#4573A2'
  try {
    const { extractTwoColors } = await import('@/lib/branding/extract-colors')
    const colors = await extractTwoColors(logoUrl)
    primary = colors.primary
    secondary = colors.secondary
  } catch (err) {
    console.error('[KFZ-139] Color-Extraction fehlgeschlagen, Defaults verwendet:', err)
  }

  return { logo_url: logoUrl, primary, secondary }
}

export async function saveGutachterBranding(data: {
  logo_url?: string
  brand_primary: string
  brand_secondary: string
  use_custom_branding: boolean
}): Promise<void> {
  const { supabase, svId } = await requireGutachter()

  // Hex-Validierung
  const hexRe = /^#[0-9a-fA-F]{6}$/
  if (!hexRe.test(data.brand_primary)) throw new Error('Primaerfarbe ungueltig')
  if (!hexRe.test(data.brand_secondary)) throw new Error('Sekundaerfarbe ungueltig')

  const updateData: Record<string, unknown> = {
    brand_primary: data.brand_primary,
    brand_secondary: data.brand_secondary,
    use_custom_branding: data.use_custom_branding,
  }
  if (data.logo_url) updateData.logo_url = data.logo_url

  const { error } = await supabase.from('sachverstaendige').update(updateData).eq('id', svId)
  if (error) throw new Error(error.message)

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/profil')
}

export async function toggleCustomBranding(enabled: boolean): Promise<void> {
  const { supabase, svId } = await requireGutachter()
  const { error } = await supabase.from('sachverstaendige').update({ use_custom_branding: enabled }).eq('id', svId)
  if (error) throw new Error(error.message)

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/profil')
}
