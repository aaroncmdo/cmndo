// AAR-536 (K4): White-Label-Theme für das Kunde-Portal.
//
// Business-Rule: Der Kunde sieht im Portal das Branding seines zugewiesenen
// SVs — ABER nur wenn der SV verifiziert ist (`sachverstaendige.verifiziert = true`).
// Asymmetrie zum Gutachter-Portal: Der SV darf sein eigenes Portal schon
// vor Verifizierung customized sehen (`use_custom_branding`), damit er es
// während des Onboardings branden kann. Der Kunde aber soll bis zur
// Verifizierung die vertrauenswürdige Claimondo-Marke sehen — sonst wäre
// er Versuchskaninchen für unverified Partner.
//
// Fallback-Kette:
//   1. Kein zugewiesener Fall / kein sv_id → Claimondo-Default
//   2. SV nicht verifiziert → Claimondo-Default
//   3. SV hat `use_custom_branding = false` → Claimondo-Default (SV will kein Branding)
//   4. SV hat kein brand_theme + keine brand_primary → Claimondo-Default
//   5. Sonst → hydratisiertes V2-Theme + SV-Logo + Firmenname

import { createClient } from '@/lib/supabase/server'
import { CLAIMONDO_DEFAULT_THEME, hydrateTheme, type BrandThemeV2 } from './theme'

export type KundenThemeResult = {
  theme: BrandThemeV2
  logoUrl: string | null
  firmenname: string | null
  useBrand: boolean
}

export async function resolveKundenTheme(kundeId: string): Promise<KundenThemeResult> {
  const fallback: KundenThemeResult = {
    theme: CLAIMONDO_DEFAULT_THEME,
    logoUrl: null,
    firmenname: null,
    useBrand: false,
  }

  const supabase = await createClient()

  // 1) Neuesten Fall des Kunden mit zugewiesenem SV finden
  const { data: fall } = await supabase
    .from('faelle')
    .select('sv_id')
    .eq('kunde_id', kundeId)
    .not('sv_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!fall?.sv_id) return fallback

  // 2) SV-Daten laden
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('verifiziert, use_custom_branding, brand_theme, brand_primary, brand_secondary, logo_url, firmenname')
    .eq('id', fall.sv_id)
    .maybeSingle()

  if (!sv) return fallback

  // 3) Nur bei verifiziertem SV + aktivem Custom-Branding wird das Theme ausgerollt
  if (sv.verifiziert !== true) return fallback
  if (sv.use_custom_branding !== true) return fallback

  // 4) Theme hydrieren — V2 wenn vorhanden, sonst aus Legacy-Primary generieren
  const theme = hydrateTheme(
    sv.brand_theme as Parameters<typeof hydrateTheme>[0],
    sv.brand_primary ?? null,
    sv.brand_secondary ?? null,
  )

  // 5) Ohne Primary gibt's nichts zu branden
  if (!sv.brand_primary && !sv.brand_theme) return fallback

  return {
    theme,
    logoUrl: sv.logo_url ?? null,
    firmenname: sv.firmenname ?? null,
    useBrand: true,
  }
}
