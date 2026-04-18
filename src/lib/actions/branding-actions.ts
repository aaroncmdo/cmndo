'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

// AAR-454: uploadGutachterLogo / saveGutachterBranding / toggleCustomBranding
// entfernt — wurden ausschliesslich vom alten V1-Branding-UI auf /gutachter/profil
// genutzt, das jetzt zugunsten des AAR-422-Editors unter /gutachter/profil/branding
// ersetzt wurde. Die neuen Editor-Actions liegen in src/lib/actions/sv-branding/*.

// ── KFZ-157: Logo-Upload-Step im Willkommen-Flow ────────────────────────

/**
 * KFZ-157: SV-Logo hochladen + Branding speichern in einem Step.
 * Wird vom LogoUploadStep im Willkommen-Wizard (Solo-Variante) aufgerufen
 * nach erfolgreicher Stripe-Anzahlung.
 */
export async function uploadSvLogo(formData: FormData): Promise<{
  logo_url: string
  brand_primary: string
  brand_secondary: string
}> {
  const { svId } = await requireGutachter()

  const file = formData.get('logo') as File
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewählt')
  if (file.size > 2 * 1024 * 1024) throw new Error('Datei zu groß (max 2 MB)')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
    throw new Error('Nur PNG, JPG, SVG oder WebP erlaubt')
  }

  // AAR-218: Admin-Client für Storage — Identität oben bereits verifiziert.
  const db = createAdminClient()
  const path = `${svId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await db.storage
    .from('gutachter-logos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data: urlData } = db.storage.from('gutachter-logos').getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  // Server-side Farb-Extraction via node-vibrant
  let brand_primary = '#1E3A5F'
  let brand_secondary = '#4573A2'
  try {
    const { extractTwoColors } = await import('@/lib/branding/extract-colors')
    const colors = await extractTwoColors(logoUrl)
    brand_primary = colors.primary
    brand_secondary = colors.secondary
  } catch (err) {
    console.error('[KFZ-157] Color-Extraction fehlgeschlagen, Defaults verwendet:', err)
  }

  // AAR-220: Vollständiges Theme aus primary ableiten + zusätzlich speichern.
  const { generateTheme } = await import('@/lib/branding/theme')
  const theme = generateTheme(brand_primary)

  // Speichern + use_custom_branding aktivieren (das Logo wird ja jetzt
  // genutzt — sonst koennten wir uns die ganze Extraktion sparen).
  const { error } = await db.from('sachverstaendige').update({
    logo_url: logoUrl,
    brand_primary,
    brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
    brand_extracted_at: new Date().toISOString(),
    use_custom_branding: true,
  }).eq('id', svId)
  if (error) throw new Error(`DB-Update fehlgeschlagen: ${error.message}`)

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/willkommen')
  return { logo_url: logoUrl, brand_primary, brand_secondary }
}

/**
 * KFZ-157: Buero-Logo hochladen + Branding fuer die Organisation speichern.
 * Wird vom Buero-Inhaber im Willkommen-Wizard aufgerufen — die extrahierten
 * Farben landen auf der Organisation, sodass alle Sub-SVs sie automatisch
 * erben (siehe BrandedLayout / GutachterShell).
 */
export async function uploadBueroLogo(formData: FormData): Promise<{
  logo_url: string
  brand_primary: string
  brand_secondary: string
}> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const organisation_id = formData.get('organisation_id') as string | null
  if (!organisation_id) throw new Error('organisation_id fehlt')

  // Berechtigung pruefen — nur der Inhaber darf das Buero-Logo setzen
  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('id, hauptansprechpartner_user_id')
    .eq('id', organisation_id)
    .single()
  if (!org || org.hauptansprechpartner_user_id !== user.id) {
    throw new Error('Keine Berechtigung für dieses Büro')
  }

  const file = formData.get('logo') as File
  if (!file || file.size === 0) throw new Error('Keine Datei ausgewählt')
  if (file.size > 2 * 1024 * 1024) throw new Error('Datei zu groß (max 2 MB)')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
    throw new Error('Nur PNG, JPG, SVG oder WebP erlaubt')
  }

  // AAR-218: Storage-Upload via Admin-Client. Pfad: org/<id>/... damit
  // Büro- und SV-Logos sich nicht beißen.
  const path = `org/${organisation_id}/${Date.now()}.${ext}`
  const { error: uploadErr } = await db.storage
    .from('gutachter-logos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data: urlData } = db.storage.from('gutachter-logos').getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  let brand_primary = '#1E3A5F'
  let brand_secondary = '#4573A2'
  try {
    const { extractTwoColors } = await import('@/lib/branding/extract-colors')
    const colors = await extractTwoColors(logoUrl)
    brand_primary = colors.primary
    brand_secondary = colors.secondary
  } catch (err) {
    console.error('[KFZ-157] Buero-Color-Extraction fehlgeschlagen, Defaults verwendet:', err)
  }

  // AAR-220: Theme ableiten + auf Org und Inhaber-SV speichern.
  const { generateTheme: genTheme } = await import('@/lib/branding/theme')
  const theme = genTheme(brand_primary)

  // Auf Org speichern → Sub-SVs erben das Branding via Layout-Lookup
  const { error } = await db.from('organisationen').update({
    logo_url: logoUrl,
    brand_primary,
    brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
    brand_extracted_at: new Date().toISOString(),
    use_custom_branding: true,
  }).eq('id', organisation_id)
  if (error) throw new Error(`Org-Update fehlgeschlagen: ${error.message}`)

  // Inhaber-SV bekommt das Logo ebenfalls direkt aufs eigene Profil, damit
  // sein Dashboard sofort gebrandet ist (er triggert ja gerade das Onboarding).
  await db.from('sachverstaendige').update({
    logo_url: logoUrl,
    brand_primary,
    brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
    brand_extracted_at: new Date().toISOString(),
    use_custom_branding: true,
  }).eq('organisation_id', organisation_id).eq('ist_parent_account', true)

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/willkommen')
  return { logo_url: logoUrl, brand_primary, brand_secondary }
}

/**
 * KFZ-157: Manuelle Farb-Override speichern (Color-Picker Pfad). Solo-SV
 * Variante. Wird aus dem LogoUploadStep aufgerufen wenn der User die
 * extrahierten Farben anpasst.
 */
export async function saveSvBrandColors(params: {
  brand_primary: string
  brand_secondary: string
}): Promise<void> {
  const { svId } = await requireGutachter()
  const hexRe = /^#[0-9a-fA-F]{6}$/
  if (!hexRe.test(params.brand_primary)) throw new Error('Primaerfarbe ungueltig')
  if (!hexRe.test(params.brand_secondary)) throw new Error('Sekundaerfarbe ungueltig')

  // AAR-220: Theme aus dem manuell gewählten primary regenerieren — secondary
  // bleibt der User-Wert (Override).
  // AAR-419 Follow-up: themeFromLegacy() statt Spread — rederived Variants.
  const { themeFromLegacy } = await import('@/lib/branding/theme')
  const theme = themeFromLegacy(params.brand_primary, params.brand_secondary)

  const db = createAdminClient()
  const { error } = await db.from('sachverstaendige').update({
    brand_primary: params.brand_primary,
    brand_secondary: params.brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
  }).eq('id', svId)
  if (error) throw new Error(error.message)
  revalidatePath('/gutachter')
}

/**
 * KFZ-157: Manuelle Farb-Override fuer ein Buero (Inhaber-Pfad).
 */
export async function saveBueroBrandColors(params: {
  organisation_id: string
  brand_primary: string
  brand_secondary: string
}): Promise<void> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const hexRe = /^#[0-9a-fA-F]{6}$/
  if (!hexRe.test(params.brand_primary)) throw new Error('Primaerfarbe ungueltig')
  if (!hexRe.test(params.brand_secondary)) throw new Error('Sekundaerfarbe ungueltig')

  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('hauptansprechpartner_user_id')
    .eq('id', params.organisation_id)
    .single()
  if (!org || org.hauptansprechpartner_user_id !== user.id) {
    throw new Error('Keine Berechtigung')
  }

  // AAR-220: Theme regenerieren mit User-Override für secondary.
  // AAR-419 Follow-up: themeFromLegacy() statt Spread — rederived Variants.
  const { themeFromLegacy } = await import('@/lib/branding/theme')
  const theme = themeFromLegacy(params.brand_primary, params.brand_secondary)

  await db.from('organisationen').update({
    brand_primary: params.brand_primary,
    brand_secondary: params.brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
  }).eq('id', params.organisation_id)

  await db.from('sachverstaendige').update({
    brand_primary: params.brand_primary,
    brand_secondary: params.brand_secondary,
    brand_accent: theme.accent,
    brand_theme: theme,
  }).eq('organisation_id', params.organisation_id).eq('ist_parent_account', true)

  revalidatePath('/gutachter')
}
