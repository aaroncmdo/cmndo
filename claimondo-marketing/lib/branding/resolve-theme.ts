import type { SupabaseClient } from '@supabase/supabase-js'
import { CLAIMONDO_DEFAULT_THEME, hydrateTheme, type BrandThemeV2 } from './theme'

// AAR-424: Theme-Resolver für Server-Components.
//
// Reihenfolge:
// 1. Org-Branding wenn SV einer Org angehört UND Org hat use_custom_branding
//    (Sub-SVs erben so das Büro-Theme).
// 2. Eigenes SV-Branding wenn use_custom_branding=true.
// 3. Claimondo-Default.
//
// Liefert IMMER ein voll-hydratisiertes V2-Theme zurück. V1-DB-Records werden
// via hydrateTheme() lazy auf V2 gezogen.

export type ResolvedBranding = {
  theme: BrandThemeV2
  logoUrl: string | null
  firmenname: string | null
  useCustom: boolean
  source: 'org' | 'sv' | 'default'
}

export async function resolveBrandTheme(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolvedBranding> {
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('organisation_id, logo_url, firmenname, brand_primary, brand_secondary, brand_theme, use_custom_branding')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle()

  if (!sv) return defaultBranding()

  // Org-Vorrang — Sub-SVs erben automatisch.
  if (sv.organisation_id) {
    const { data: org } = await supabase
      .from('organisationen')
      .select('logo_url, firmenname, brand_primary, brand_secondary, brand_theme, use_custom_branding')
      .eq('id', sv.organisation_id)
      .maybeSingle()

    if (org?.use_custom_branding && (org.brand_primary || org.brand_theme)) {
      return {
        theme: hydrateTheme(
          org.brand_theme as Parameters<typeof hydrateTheme>[0],
          (org.brand_primary as string | null) ?? null,
          (org.brand_secondary as string | null) ?? null,
        ),
        logoUrl: (org.logo_url as string | null) ?? null,
        firmenname: (org.firmenname as string | null) ?? null,
        useCustom: true,
        source: 'org',
      }
    }
  }

  if (sv.use_custom_branding && (sv.brand_primary || sv.brand_theme)) {
    return {
      theme: hydrateTheme(
        sv.brand_theme as Parameters<typeof hydrateTheme>[0],
        (sv.brand_primary as string | null) ?? null,
        (sv.brand_secondary as string | null) ?? null,
      ),
      logoUrl: (sv.logo_url as string | null) ?? null,
      firmenname: (sv.firmenname as string | null) ?? null,
      useCustom: true,
      source: 'sv',
    }
  }

  return defaultBranding()
}

function defaultBranding(): ResolvedBranding {
  return {
    theme: CLAIMONDO_DEFAULT_THEME,
    logoUrl: null,
    firmenname: null,
    useCustom: false,
    source: 'default',
  }
}

// AAR-branding-rest (2026-05-12): isBrandingV2Enabled() entfernt — war ein
// totes Feature-Flag (NEXT_PUBLIC_BRANDING_V2_ENABLED wurde nirgends
// abgefragt, V2 läuft seit AAR-460 immer). Kein Consumer im ganzen Repo.
