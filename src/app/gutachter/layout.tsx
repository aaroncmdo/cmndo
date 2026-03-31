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

  // Fetch brand colors + logo
  let { data: sv } = await supabase
    .from('sachverstaendige')
    .select('logo_url, brand_primary, brand_secondary')
    .eq('profile_id', user.id)
    .single()
  if (!sv) {
    const r = await supabase.from('sachverstaendige').select('logo_url, brand_primary, brand_secondary').eq('user_id', user.id).single()
    sv = r.data
  }

  return (
    <GutachterShell
      displayName={displayName}
      logoUrl={sv?.logo_url ?? null}
      brandPrimary={sv?.brand_primary ?? null}
      brandSecondary={sv?.brand_secondary ?? null}
    >
      {children}
    </GutachterShell>
  )
}
