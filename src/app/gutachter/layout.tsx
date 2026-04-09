import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import GutachterShell from './GutachterShell'

export default async function GutachterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'sachverstaendiger') redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  const svSelect = 'logo_url, brand_primary, brand_secondary, use_custom_branding, vertrag_unterschrieben, anzahlung_status, freigeschaltet, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet'
  let { data: sv } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    .single()
  if (!sv) {
    const r = await supabase.from('sachverstaendige').select(svSelect).eq('user_id', user.id).single()
    sv = r.data
  }

  // Check if this gutachter has been soft-deleted → sign out + redirect
  if (sv) {
    let isDeleted = false
    try {
      const { data: svCheck } = await supabase
        .from('sachverstaendige')
        .select('geloescht_am')
        .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)
        .single()
      if (svCheck?.geloescht_am) isDeleted = true
    } catch { /* geloescht_am column may not exist */ }
    if (isDeleted) {
      await supabase.auth.signOut()
      redirect('/login?error=Ihr%20Account%20wurde%20deaktiviert.%20Bitte%20kontaktieren%20Sie%20den%20Support.')
    }
  }

  const isDeactivated = sv?.ist_aktiv === false

  // KFZ-148: Hard-Blocker — Portal-Zugang nur wenn freigeschaltet.
  // BUG-A.1 fix: greift jetzt auch fuer User die noch GAR KEINEN
  // sachverstaendige-Eintrag haben.
  // ARCH-1 Phase 1: /gutachter/willkommen ist der neue Onboarding-Pfad
  // (3-Step Konditionen → Vertrag → Stripe). /gutachter/onboarding ist nur
  // noch eine Redirect-Logik, bleibt aber whitelisted fuer Backwards-Compat.
  if (!sv || sv.portal_zugang_freigeschaltet === false) {
    const h = await headers()
    const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
    const isOnboardingPath =
      pathname.includes('/gutachter/onboarding') ||
      pathname.includes('/gutachter/willkommen')
    if (!isOnboardingPath) {
      redirect('/gutachter/willkommen')
    }
  }

  return (
    <GutachterShell
      displayName={displayName}
      logoUrl={sv?.use_custom_branding ? (sv?.logo_url ?? null) : null}
      brandPrimary={sv?.use_custom_branding ? (sv?.brand_primary ?? null) : null}
      brandSecondary={sv?.use_custom_branding ? (sv?.brand_secondary ?? null) : null}
      standortLat={sv?.standort_lat ? Number(sv.standort_lat) : null}
      standortLng={sv?.standort_lng ? Number(sv.standort_lng) : null}
    >
      {/* Deaktiviert-Banner */}
      {isDeactivated && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-center text-xs text-red-700 font-medium">
          Ihr Account ist deaktiviert. Sie erhalten keine neuen Fälle. Bitte begleichen Sie offene Rechnungen.
        </div>
      )}
      {/* Anzahlung-Banner */}
      {!isDeactivated && sv?.vertrag_unterschrieben && sv?.anzahlung_status !== 'bezahlt' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
          Ihre Anzahlung ist noch ausstehend. Sie erhalten Fälle sobald die Zahlung eingegangen ist.
        </div>
      )}
      {children}
    </GutachterShell>
  )
}
