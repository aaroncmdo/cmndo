import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BrandingEditor from '@/components/branding/BrandingEditor'
import type { BrandTheme } from '@/lib/branding/theme'
import type { FontCategory } from '@/lib/branding/fonts'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

// AAR-422: /gutachter/profil/branding — dedizierte Seite für Logo-Upload +
// Farb-Extraktion + Font-Auswahl + Live-Preview. Vom Profil über einen Link
// erreichbar; Sub-SVs ohne ist_parent_account sehen nur SV-Scope, Büro-
// Inhaber haben zusätzlich die Option "Ganzes Büro".

export default async function BrandingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'sachverstaendiger') redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, logo_url, brand_primary, brand_secondary, brand_theme, firmenname, organisation_id, ist_parent_account, rolle_in_organisation')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!sv) redirect('/gutachter/willkommen')

  // Sub-SVs (community_member) sehen die Seite nicht — ihr Branding erben sie
  // vom Inhaber. Sie werden auf Profil zurück geleitet.
  if (sv.rolle_in_organisation === 'community_member') {
    redirect('/gutachter/profil')
  }

  const storedTheme = (sv.brand_theme as Partial<BrandTheme> | null) ?? null
  const initialFontPairId = (storedTheme?.fontPairId as string | null | undefined) ?? null

  // AAR-456: Persistierte Claude-Vision-Empfehlung → "Empfohlen"-Badge im
  // FontPicker auch nach Page-Reload anzeigen. Null wenn noch nie analysiert.
  const initialFontCategoryRecommendation =
    (storedTheme?.fontCategoryRecommendation as FontCategory | null | undefined) ?? null

  // Fallback: wenn brand_theme leer aber brand_primary gesetzt, aus Legacy hydrieren.
  const initialTheme: Partial<BrandTheme> | null = storedTheme
    ?? (sv.brand_primary
      ? { primary: sv.brand_primary, secondary: sv.brand_secondary ?? sv.brand_primary } as Partial<BrandTheme>
      : null)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <Link
        href="/gutachter/profil"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Zurück zum Profil
      </Link>
      <BrandingEditor
        initialLogoUrl={sv.logo_url ?? null}
        initialTheme={initialTheme}
        initialFontPairId={initialFontPairId}
        initialFontCategoryRecommendation={initialFontCategoryRecommendation}
        firmenname={sv.firmenname ?? null}
        canSaveToOrg={!!(sv.ist_parent_account && sv.organisation_id)}
      />
    </div>
  )
}
