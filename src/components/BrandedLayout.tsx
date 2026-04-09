import { createClient } from '@/lib/supabase/server'

// KFZ-157: Branding-Wrapper, der das aktuelle SV- bzw. Buero-Branding aus
// der DB laedt und als CSS-Variablen auf einem Wrapper-Div setzt. Sub-SVs
// erben automatisch das Branding ihrer Organisation, weil wir bei einer
// vorhandenen organisation_id zuerst dort schauen.
//
// Verwendung (Server-Component):
//   <BrandedLayout>
//     <div className="bg-[var(--brand-primary)] text-[var(--brand-primary-text)]">
//       ...
//     </div>
//   </BrandedLayout>
//
// Default fallback: Claimondo-Blau (#1E3A5F primary, #4573A2 accent).

const DEFAULT_PRIMARY = '#1E3A5F'
const DEFAULT_ACCENT = '#4573A2'
const DEFAULT_SECONDARY = '#0D1B3E'

type BrandingData = {
  logo_url: string | null
  brand_primary: string
  brand_accent: string
  brand_secondary: string
  brand_primary_text: '#ffffff' | '#000000'
}

/**
 * Liest das aktuelle Branding fuer den eingeloggten User. Reihenfolge:
 *   1. Wenn der SV einer Org angehoert + Org hat use_custom_branding=true
 *      → Org-Branding (Sub-SVs erben so das Buero-Logo).
 *   2. Sonst eigenes SV-Branding wenn use_custom_branding=true.
 *   3. Default-Claimondo-Farben.
 */
export async function loadBranding(): Promise<BrandingData> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return defaultBranding()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('organisation_id, logo_url, brand_primary, brand_secondary, brand_accent, use_custom_branding')
    .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle()
  if (!sv) return defaultBranding()

  // Org-Branding hat Vorrang, damit Sub-Mitarbeiter automatisch das
  // Buero-Logo erben — auch wenn sie selbst noch keine Logo-Spalten gefuellt haben.
  if (sv.organisation_id) {
    const { data: org } = await supabase
      .from('organisationen')
      .select('logo_url, brand_primary, brand_secondary, brand_accent, use_custom_branding')
      .eq('id', sv.organisation_id)
      .maybeSingle()
    if (org?.use_custom_branding && (org.brand_primary || org.logo_url)) {
      return finalize({
        logo_url: org.logo_url ?? null,
        brand_primary: org.brand_primary ?? DEFAULT_PRIMARY,
        brand_accent: org.brand_accent ?? org.brand_secondary ?? DEFAULT_ACCENT,
        brand_secondary: org.brand_secondary ?? DEFAULT_SECONDARY,
      })
    }
  }

  if (sv.use_custom_branding && (sv.brand_primary || sv.logo_url)) {
    return finalize({
      logo_url: sv.logo_url ?? null,
      brand_primary: sv.brand_primary ?? DEFAULT_PRIMARY,
      brand_accent: sv.brand_accent ?? sv.brand_secondary ?? DEFAULT_ACCENT,
      brand_secondary: sv.brand_secondary ?? DEFAULT_SECONDARY,
    })
  }

  return defaultBranding()
}

function defaultBranding(): BrandingData {
  return finalize({
    logo_url: null,
    brand_primary: DEFAULT_PRIMARY,
    brand_accent: DEFAULT_ACCENT,
    brand_secondary: DEFAULT_SECONDARY,
  })
}

function finalize(b: Omit<BrandingData, 'brand_primary_text'>): BrandingData {
  return {
    ...b,
    brand_primary_text: contrastText(b.brand_primary),
  }
}

/**
 * Auto-Contrast: WCAG-konformes Schwarz/Weiss fuer Text auf der
 * brand_primary Hintergrundfarbe. Berechnung ueber relative Luminanz.
 */
function contrastText(hex: string): '#ffffff' | '#000000' {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return '#ffffff'
  const r = parseInt(cleaned.substring(0, 2), 16) / 255
  const g = parseInt(cleaned.substring(2, 4), 16) / 255
  const b = parseInt(cleaned.substring(4, 6), 16) / 255
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b)
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

/**
 * Server-Component-Wrapper, der das geladene Branding als CSS-Variablen
 * auf einem div setzt. Kindkomponenten koennen Tailwind-Vars wie
 * `bg-[var(--brand-primary)]` oder `text-[var(--brand-primary-text)]` nutzen.
 */
export default async function BrandedLayout({ children }: { children: React.ReactNode }) {
  const b = await loadBranding()
  return (
    <div
      style={{
        // CSS-Vars sind via inline-style scoped auf diesen Wrapper
        ['--brand-primary' as string]: b.brand_primary,
        ['--brand-accent' as string]: b.brand_accent,
        ['--brand-secondary' as string]: b.brand_secondary,
        ['--brand-primary-text' as string]: b.brand_primary_text,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
