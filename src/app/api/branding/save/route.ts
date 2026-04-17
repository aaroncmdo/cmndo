// AAR-422: PATCH /api/branding/save
//
// Persistiert das fertige BrandThemeV2 + Logo-URL + fontPairId. Wird vom
// BrandingEditor nach "Speichern" aufgerufen. Setzt use_custom_branding=true
// und brand_primary/secondary/accent + brand_theme (25 Tokens).
//
// Büro-Inhaber können zusätzlich scope='org' mitsenden — dann wird das Theme
// auf der Organisation + dem eigenen SV-Row gleichzeitig gespeichert (Sub-SVs
// erben via layout-Lookup).

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hydrateTheme, type BrandTheme } from '@/lib/branding/theme'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEX = /^#[0-9A-Fa-f]{6}$/

type Payload = {
  logoUrl?: string | null
  theme: Partial<BrandTheme> & { primary: string; secondary: string; accent: string }
  fontPairId?: string | null
  scope?: 'sv' | 'org'
}

function validateHex(theme: Partial<BrandTheme>): string | null {
  for (const key of ['primary', 'secondary', 'accent'] as const) {
    const v = theme[key]
    if (typeof v !== 'string' || !HEX.test(v)) return `${key} ist kein gültiger Hex-Wert`
  }
  return null
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, organisation_id, ist_parent_account')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!sv) return NextResponse.json({ error: 'Kein SV-Profil' }, { status: 403 })

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  if (!body?.theme) {
    return NextResponse.json({ error: 'theme-Feld fehlt' }, { status: 400 })
  }
  const hexError = validateHex(body.theme)
  if (hexError) return NextResponse.json({ error: hexError }, { status: 400 })

  // Via hydrateTheme() garantieren wir volle V2-Expansion + contrastSafe-
  // Recheck — auch wenn der Client nur Teile schickt.
  const fullTheme = hydrateTheme(
    { ...body.theme, fontPairId: body.fontPairId ?? null },
    body.theme.primary,
    body.theme.secondary,
  )

  const useOrg = body.scope === 'org' && sv.ist_parent_account && sv.organisation_id
  const db = createAdminClient()

  const commonPatch: Record<string, unknown> = {
    brand_primary: fullTheme.primary,
    brand_secondary: fullTheme.secondary,
    brand_accent: fullTheme.accent,
    brand_theme: fullTheme,
    use_custom_branding: true,
    brand_extracted_at: new Date().toISOString(),
  }
  if (body.logoUrl && typeof body.logoUrl === 'string') {
    commonPatch.logo_url = body.logoUrl
  }

  if (useOrg) {
    const { error: orgErr } = await db.from('organisationen').update(commonPatch).eq('id', sv.organisation_id!)
    if (orgErr) return NextResponse.json({ error: `Org-Update: ${orgErr.message}` }, { status: 500 })
    // Inhaber-SV bekommt das Branding ebenfalls direkt, damit sein Portal
    // sofort gebrandet ist und nicht erst über den Org-Lookup läuft.
    await db.from('sachverstaendige').update(commonPatch).eq('id', sv.id)
  } else {
    const { error: svErr } = await db.from('sachverstaendige').update(commonPatch).eq('id', sv.id)
    if (svErr) return NextResponse.json({ error: `SV-Update: ${svErr.message}` }, { status: 500 })
  }

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/profil/branding')
  return NextResponse.json({ success: true, theme: fullTheme })
}
