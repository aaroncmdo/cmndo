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
export type UploadLogoResult =
  | { ok: true; logo_url: string; brand_primary: string; brand_secondary: string; brand_accent: string }
  | { ok: false; error: string }

export async function uploadSvLogo(formData: FormData): Promise<UploadLogoResult> {
  const { svId } = await requireGutachter()

  const file = formData.get('logo') as File
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei ausgewählt' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'Datei zu groß (max 2 MB)' }

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'avif'].includes(rawExt)) {
    return { ok: false, error: 'Nur PNG, JPG, SVG, WebP oder AVIF erlaubt' }
  }

  // 2026-05-14: Onboarding-Pfad nutzt denselben Chroma-Key-BG-Remover wie
  // /api/branding/upload (server-bg-remove.ts). Für SVG wird der Helper über-
  // sprungen (Vektor), für alle Raster-Formate normalisiert er auf PNG mit
  // sauberem Alpha — fronius/gall-Style Logos kommen so brandfähig in den
  // Bucket.
  let uploadBuffer: File | Buffer = file
  let uploadContentType = file.type
  let uploadExt = rawExt
  if (file.type !== 'image/svg+xml') {
    try {
      const { stripSolidBackground } = await import('@/lib/branding/server-bg-remove')
      const srcBuffer = Buffer.from(await file.arrayBuffer())
      const result = await stripSolidBackground(srcBuffer)
      uploadBuffer = result.cleaned
      uploadContentType = result.contentType
      uploadExt = result.ext
      if (result.applied && result.bgColor) {
        console.info(
          `[KFZ-157] chroma-key applied — BG rgb(${result.bgColor.r},${result.bgColor.g},${result.bgColor.b})`,
        )
      }
    } catch (err) {
      console.warn('[KFZ-157] sharp post-process übersprungen:', err)
    }
  }

  // AAR-218: Admin-Client für Storage — Identität oben bereits verifiziert.
  const db = createAdminClient()
  const path = `${svId}/${Date.now()}.${uploadExt}`
  const { error: uploadErr } = await db.storage
    .from('gutachter-logos')
    .upload(path, uploadBuffer, { contentType: uploadContentType, upsert: true })
  if (uploadErr) return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const { data: urlData } = db.storage.from('gutachter-logos').getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  // 2026-05-14: V2-Extraktion (extractBrandPalette) statt V1 (extractTwoColors).
  // V2 nutzt Vibrancy-Ranking (knallige Logo-Farbe gewinnt) + sharp-flatten für
  // transparente PNGs (Auto-BG-Remove-Output) + max-deltaE für secondary (=
  // der gedeckte Logo-Ton, gut lesbar als Text). Aaron-Brief 14.05.: "knallige
  // farbe wählen und ein setz daraus generieren, das aber auch die weniger
  // knallige farbe enthält für schriften".
  let brand_primary = '#1E3A5F'
  let brand_secondary = '#4573A2'
  let brand_accent = '#7BA3CC'
  let recommendedFontCategory: 'racing' | 'elegance' | 'kanoo' = 'kanoo'
  try {
    const { extractBrandPalette } = await import('@/lib/branding/extract-colors')
    const palette = await extractBrandPalette(logoUrl)
    brand_primary = palette.primary
    brand_secondary = palette.secondary
    brand_accent = palette.accent
    recommendedFontCategory = palette.recommendedFontCategory
  } catch (err) {
    console.error('[KFZ-157] Color-Extraction fehlgeschlagen, Defaults verwendet:', err)
  }

  // AAR-220: Vollständiges Theme aus primary ableiten + extrahierte Sekundär-
  // und Akzent-Farben überschreiben (sonst würden generateTheme()-Derivate
  // gewinnen, die aus dem Logo extrahierten Werte aber sind authentischer).
  const { generateTheme } = await import('@/lib/branding/theme')
  const { DEFAULT_FONT_PER_CATEGORY } = await import('@/lib/branding/fonts')
  const baseTheme = generateTheme(brand_primary)
  const theme = {
    ...baseTheme,
    secondary: brand_secondary,
    accent: brand_accent,
    fontPairId: DEFAULT_FONT_PER_CATEGORY[recommendedFontCategory],
  }

  // Speichern + use_custom_branding aktivieren (das Logo wird ja jetzt
  // genutzt — sonst koennten wir uns die ganze Extraktion sparen).
  const { error } = await db.from('sachverstaendige').update({
    logo_url: logoUrl,
    brand_primary,
    brand_secondary,
    brand_accent,
    brand_theme: theme,
    brand_extracted_at: new Date().toISOString(),
    use_custom_branding: true,
  }).eq('id', svId)
  if (error) return { ok: false, error: `DB-Update fehlgeschlagen: ${error.message}` }

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/willkommen')
  return { ok: true, logo_url: logoUrl, brand_primary, brand_secondary, brand_accent }
}

/**
 * KFZ-157: Buero-Logo hochladen + Branding fuer die Organisation speichern.
 * Wird vom Buero-Inhaber im Willkommen-Wizard aufgerufen — die extrahierten
 * Farben landen auf der Organisation, sodass alle Sub-SVs sie automatisch
 * erben (siehe BrandedLayout / GutachterShell).
 */
export async function uploadBueroLogo(formData: FormData): Promise<UploadLogoResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const organisation_id = formData.get('organisation_id') as string | null
  if (!organisation_id) return { ok: false, error: 'organisation_id fehlt' }

  // Berechtigung pruefen — nur der Inhaber darf das Buero-Logo setzen
  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('id, hauptansprechpartner_user_id')
    .eq('id', organisation_id)
    .single()
  if (!org || org.hauptansprechpartner_user_id !== user.id) {
    return { ok: false, error: 'Keine Berechtigung für dieses Büro' }
  }

  const file = formData.get('logo') as File
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei ausgewählt' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'Datei zu groß (max 2 MB)' }

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'avif'].includes(rawExt)) {
    return { ok: false, error: 'Nur PNG, JPG, SVG, WebP oder AVIF erlaubt' }
  }

  // 2026-05-14: Server-Chroma-Key auch im Büro-Upload (siehe uploadSvLogo).
  let uploadBuffer: File | Buffer = file
  let uploadContentType = file.type
  let uploadExt = rawExt
  if (file.type !== 'image/svg+xml') {
    try {
      const { stripSolidBackground } = await import('@/lib/branding/server-bg-remove')
      const srcBuffer = Buffer.from(await file.arrayBuffer())
      const result = await stripSolidBackground(srcBuffer)
      uploadBuffer = result.cleaned
      uploadContentType = result.contentType
      uploadExt = result.ext
    } catch (err) {
      console.warn('[KFZ-157 buero] sharp post-process übersprungen:', err)
    }
  }

  // AAR-218: Storage-Upload via Admin-Client. Pfad: org/<id>/... damit
  // Büro- und SV-Logos sich nicht beißen.
  const path = `org/${organisation_id}/${Date.now()}.${uploadExt}`
  const { error: uploadErr } = await db.storage
    .from('gutachter-logos')
    .upload(path, uploadBuffer, { contentType: uploadContentType, upsert: true })
  if (uploadErr) return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  const { data: urlData } = db.storage.from('gutachter-logos').getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  // 2026-05-14: V2-Extraktion (siehe uploadSvLogo Kommentar).
  let brand_primary = '#1E3A5F'
  let brand_secondary = '#4573A2'
  let brand_accent = '#7BA3CC'
  let recommendedFontCategory: 'racing' | 'elegance' | 'kanoo' = 'kanoo'
  try {
    const { extractBrandPalette } = await import('@/lib/branding/extract-colors')
    const palette = await extractBrandPalette(logoUrl)
    brand_primary = palette.primary
    brand_secondary = palette.secondary
    brand_accent = palette.accent
    recommendedFontCategory = palette.recommendedFontCategory
  } catch (err) {
    console.error('[KFZ-157] Buero-Color-Extraction fehlgeschlagen, Defaults verwendet:', err)
  }

  // AAR-220: Theme ableiten — extrahierte Sekundär/Akzent gewinnen vs. derive.
  const { generateTheme: genTheme } = await import('@/lib/branding/theme')
  const { DEFAULT_FONT_PER_CATEGORY: fontMap } = await import('@/lib/branding/fonts')
  const baseTheme = genTheme(brand_primary)
  const theme = {
    ...baseTheme,
    secondary: brand_secondary,
    accent: brand_accent,
    fontPairId: fontMap[recommendedFontCategory],
  }

  // Auf Org speichern → Sub-SVs erben das Branding via Layout-Lookup
  const { error } = await db.from('organisationen').update({
    logo_url: logoUrl,
    brand_primary,
    brand_secondary,
    brand_accent,
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
    brand_accent,
    brand_theme: theme,
    brand_extracted_at: new Date().toISOString(),
    use_custom_branding: true,
  }).eq('organisation_id', organisation_id).eq('ist_parent_account', true)

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/willkommen')
  return { ok: true, logo_url: logoUrl, brand_primary, brand_secondary, brand_accent }
}

/**
 * KFZ-157: Manuelle Farb-Override speichern (Color-Picker Pfad). Solo-SV
 * Variante. Wird aus dem LogoUploadStep aufgerufen wenn der User die
 * extrahierten Farben anpasst.
 */
export async function saveSvBrandColors(params: {
  brand_primary: string
  brand_secondary: string
}): Promise<{ ok: boolean; error?: string }> {
  const { svId } = await requireGutachter()
  const hexRe = /^#[0-9a-fA-F]{6}$/
  if (!hexRe.test(params.brand_primary)) return { ok: false, error: 'Primaerfarbe ungueltig' }
  if (!hexRe.test(params.brand_secondary)) return { ok: false, error: 'Sekundaerfarbe ungueltig' }

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
  if (error) return { ok: false, error: error.message }
  revalidatePath('/gutachter')
  return { ok: true }
}

/**
 * 2026-05-14: Preset-Apply ohne Logo. Wird im Onboarding + Editor genutzt
 * wenn der User aus den kuratierten Theme-Presets eines wählt.
 *
 * params: presetId (validiert gegen BRAND_PRESETS) + scope.
 * Schreibt brand_primary/secondary/accent + komplett regeneriertes
 * brand_theme + fontPairId. logo_url bleibt unverändert (Preset überschreibt
 * nur Farben + Schrift).
 */
export async function applyBrandPreset(params: {
  presetId: string
  scope: 'sv' | 'org'
}): Promise<{ ok: boolean; error?: string }> {
  const { BRAND_PRESETS } = await import('@/lib/branding/theme-presets')
  const preset = BRAND_PRESETS.find(p => p.id === params.presetId)
  if (!preset) return { ok: false, error: 'Preset nicht gefunden' }

  const { themeFromLegacy } = await import('@/lib/branding/theme')
  const theme = {
    ...themeFromLegacy(preset.primary, preset.secondary),
    accent: preset.accent,
    fontPairId: preset.fontPairId,
  }

  const db = createAdminClient()

  if (params.scope === 'org') {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { ok: false, error: 'Nicht angemeldet' }
    const { data: sv } = await db.from('sachverstaendige')
      .select('organisation_id, ist_parent_account')
      .eq('profile_id', user.id)
      .maybeSingle()
    if (!sv?.organisation_id || !sv.ist_parent_account) {
      return { ok: false, error: 'Keine Berechtigung' }
    }
    await db.from('organisationen').update({
      brand_primary: preset.primary,
      brand_secondary: preset.secondary,
      brand_accent: preset.accent,
      brand_theme: theme,
      use_custom_branding: true,
    }).eq('id', sv.organisation_id)
    await db.from('sachverstaendige').update({
      brand_primary: preset.primary,
      brand_secondary: preset.secondary,
      brand_accent: preset.accent,
      brand_theme: theme,
      use_custom_branding: true,
    }).eq('organisation_id', sv.organisation_id).eq('ist_parent_account', true)
  } else {
    const { svId } = await requireGutachter()
    await db.from('sachverstaendige').update({
      brand_primary: preset.primary,
      brand_secondary: preset.secondary,
      brand_accent: preset.accent,
      brand_theme: theme,
      use_custom_branding: true,
    }).eq('id', svId)
  }

  revalidatePath('/gutachter')
  return { ok: true }
}

/**
 * KFZ-157: Manuelle Farb-Override fuer ein Buero (Inhaber-Pfad).
 */
export async function saveBueroBrandColors(params: {
  organisation_id: string
  brand_primary: string
  brand_secondary: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const hexRe = /^#[0-9a-fA-F]{6}$/
  if (!hexRe.test(params.brand_primary)) return { ok: false, error: 'Primaerfarbe ungueltig' }
  if (!hexRe.test(params.brand_secondary)) return { ok: false, error: 'Sekundaerfarbe ungueltig' }

  const db = createAdminClient()
  const { data: org } = await db.from('organisationen')
    .select('hauptansprechpartner_user_id')
    .eq('id', params.organisation_id)
    .single()
  if (!org || org.hauptansprechpartner_user_id !== user.id) {
    return { ok: false, error: 'Keine Berechtigung' }
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
  return { ok: true }
}
