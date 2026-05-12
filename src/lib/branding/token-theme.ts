// AAR-branding-rest (2026-05-12): Branding-Resolver für Magic-Link-Token-Routen.
//
// Gleiche Business-Rule wie resolveKundenTheme (siehe kunden-theme.ts): der
// Kunde sieht das Branding seines zugewiesenen SVs — aber nur wenn der SV
// verifiziert ist UND use_custom_branding aktiv hat. Sonst Claimondo-Default
// (Anti-Versuchskaninchen-Gate).
//
// Token → dokument_upload_anfragen.lead_id → neuester faelle.sv_id → SV-Theme.

import { createAdminClient } from '@/lib/supabase/admin'
import { CLAIMONDO_DEFAULT_THEME, hydrateTheme } from './theme'
import type { KundenThemeResult } from './kunden-theme'

/**
 * Resolved SV-Branding aus einem dokument_upload_anfragen-Token (Magic-Link).
 * Liefert immer ein verwendbares Theme — Claimondo-Default wenn kein/unverified
 * SV. Caller wrappt seine Page in <div style={generateCssVars(result.theme, 'full')}>.
 */
export async function resolveBrandingFromUploadToken(token: string): Promise<KundenThemeResult> {
  const fallback: KundenThemeResult = {
    theme: CLAIMONDO_DEFAULT_THEME,
    logoUrl: null,
    firmenname: null,
    useBrand: false,
  }
  if (!token || token.length < 16) return fallback

  const db = createAdminClient()

  const { data: anfrage } = await db
    .from('dokument_upload_anfragen')
    .select('lead_id')
    .eq('token', token)
    .maybeSingle()
  if (!anfrage?.lead_id) return fallback

  const { data: fall } = await db
    .from('faelle')
    .select('sv_id')
    .eq('lead_id', anfrage.lead_id as string)
    .not('sv_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!fall?.sv_id) return fallback

  const { data: sv } = await db
    .from('sachverstaendige')
    .select('verifiziert, use_custom_branding, brand_theme, brand_primary, brand_secondary, logo_url, firmenname')
    .eq('id', fall.sv_id as string)
    .maybeSingle()
  if (!sv) return fallback
  if (sv.verifiziert !== true) return fallback
  if (sv.use_custom_branding !== true) return fallback
  if (!sv.brand_primary && !sv.brand_theme) return fallback

  return {
    theme: hydrateTheme(
      sv.brand_theme as Parameters<typeof hydrateTheme>[0],
      (sv.brand_primary as string | null) ?? null,
      (sv.brand_secondary as string | null) ?? null,
    ),
    logoUrl: (sv.logo_url as string | null) ?? null,
    firmenname: (sv.firmenname as string | null) ?? null,
    useBrand: true,
  }
}
