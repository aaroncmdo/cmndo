import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  const svSelect = 'logo_url, brand_primary, brand_secondary, vertrag_unterschrieben, anzahlung_status, freigeschaltet, standort_lat, standort_lng, ist_aktiv'
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

  return (
    <GutachterShell
      displayName={displayName}
      logoUrl={sv?.logo_url ?? null}
      brandPrimary={sv?.brand_primary ?? null}
      brandSecondary={sv?.brand_secondary ?? null}
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
