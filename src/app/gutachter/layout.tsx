import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GutachterShell from './GutachterShell'

export default async function GutachterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'sachverstaendiger') redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  let { data: sv } = await supabase
    .from('sachverstaendige')
    .select('logo_url, brand_primary, brand_secondary, vertrag_unterschrieben, anzahlung_status, freigeschaltet, standort_lat, standort_lng')
    .eq('profile_id', user.id)
    .single()
  if (!sv) {
    const r = await supabase.from('sachverstaendige').select('logo_url, brand_primary, brand_secondary, vertrag_unterschrieben, anzahlung_status, freigeschaltet, standort_lat, standort_lng').eq('user_id', user.id).single()
    sv = r.data
  }

  // Redirect to contract page if not signed (but allow the contract page itself)
  const needsContract = sv && !sv.vertrag_unterschrieben

  return (
    <GutachterShell
      displayName={displayName}
      logoUrl={sv?.logo_url ?? null}
      brandPrimary={sv?.brand_primary ?? null}
      brandSecondary={sv?.brand_secondary ?? null}
      standortLat={sv?.standort_lat ? Number(sv.standort_lat) : null}
      standortLng={sv?.standort_lng ? Number(sv.standort_lng) : null}
    >
      {/* Anzahlung-Banner */}
      {sv?.vertrag_unterschrieben && sv?.anzahlung_status !== 'bezahlt' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
          Ihre Anzahlung ist noch ausstehend. Sie erhalten Fälle sobald die Zahlung eingegangen ist.
        </div>
      )}
      {children}
    </GutachterShell>
  )
}
