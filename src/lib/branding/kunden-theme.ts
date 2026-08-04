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
import { kundenBrandingErlaubt } from './gate'
import { istBrandingBezahlt } from './bezahl-status'

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
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann nicht nach eingebetteter
  // to-one-Spalte ordnen -> claims.created_at flachziehen + clientseitig neuesten picken.
  // CMM-49 (faelle-Drop-Runway): claims-direkt statt .from('faelle'). Nur sv_id gebraucht
  // (-> resolveBrandingFromSvId). kunde_id==claims.geschaedigter_user_id (div=0), sv_id 0-diff,
  // created_at lebt claims-nativ -> kein Embed/Bridge noetig.
  const { data: kundeClaims } = await supabase
    .from('claims')
    .select('sv_id, created_at')
    .eq('geschaedigter_user_id', kundeId)
    .not('sv_id', 'is', null)
  const fall = (kundeClaims ?? [])
    .map((c) => ({ sv_id: c.sv_id as string | null, _c: (c.created_at as string | null) ?? '' }))
    .sort((a, b) => b._c.localeCompare(a._c))[0] ?? null

  if (!fall?.sv_id) return fallback

  // 2) SV-Daten laden
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('verifiziert, use_custom_branding, brand_theme, brand_primary, brand_secondary, logo_url, firmenname')
    .eq('id', fall.sv_id)
    .maybeSingle()

  if (!sv) return fallback

  // 3) Nur bei verifiziertem SV + aktivem Custom-Branding wird das Theme ausgerollt
  if (!kundenBrandingErlaubt(sv)) return fallback

  // 3b) Paid-Perk (Aaron 03.08.): Wirkung nur fuer zahlende SVs (Abo oder
  // Paid-Paket) — Admin-Helper, weil der Kunden-Kontext die Abo-Row per RLS
  // nicht lesen darf. Fail-closed -> Claimondo-Default.
  if (!(await istBrandingBezahlt(fall.sv_id))) return fallback

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
