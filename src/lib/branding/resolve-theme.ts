import type { SupabaseClient } from '@supabase/supabase-js'
import { CLAIMONDO_DEFAULT_THEME, hydrateTheme, type BrandThemeV2 } from './theme'
import { svEigenBrandingErlaubt } from './gate'
import { istBrandingBezahlt, istBrandingBezahltFuerOrg } from './bezahl-status'

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
    // Paid-Perk: id fuer den Bezahl-Check des sv-Zweigs (Org-Zweig prueft den Inhaber).
    .select('id, organisation_id, logo_url, firmenname, brand_primary, brand_secondary, brand_theme, use_custom_branding')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle()

  if (!sv) return defaultBranding()

  // Org-Vorrang — Sub-SVs erben automatisch.
  if (sv.organisation_id) {
    const { data: org } = await supabase
      .from('organisationen')
      // Prod-Fix 14.07.: organisationen hat KEINE Spalte `firmenname` — sie heisst `name`
      // (verifiziert). Der frühere Select warf 42703 -> die ganze Org-Branding-Query lief ins
      // Leere -> Whitelabel-Theme fiel still auf Claimondo zurück. (sachverstaendige.firmenname
      // existiert dagegen -> die :30-Query oben bleibt.)
      .select('logo_url, name, brand_primary, brand_secondary, brand_theme, use_custom_branding')
      .eq('id', sv.organisation_id)
      .maybeSingle()

    // Paid-Perk: Org-Branding wirkt nur, wenn der INHABER zahlend ist (Aaron 03.08.).
    if (
      org &&
      svEigenBrandingErlaubt(org) &&
      (org.brand_primary || org.brand_theme) &&
      (await istBrandingBezahltFuerOrg(sv.organisation_id))
    ) {
      return {
        theme: hydrateTheme(
          org.brand_theme as Parameters<typeof hydrateTheme>[0],
          (org.brand_primary as string | null) ?? null,
          (org.brand_secondary as string | null) ?? null,
        ),
        logoUrl: (org.logo_url as string | null) ?? null,
        firmenname: (org.name as string | null) ?? null,
        useCustom: true,
        source: 'org',
      }
    }
  }

  // Paid-Perk: auch die eigene Portal-Wirkung ist zahlend-gebunden (Editor-Preview unberuehrt).
  if (
    svEigenBrandingErlaubt(sv) &&
    (sv.brand_primary || sv.brand_theme) &&
    (await istBrandingBezahlt((sv as { id?: string }).id ?? null))
  ) {
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
