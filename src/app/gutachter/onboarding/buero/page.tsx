import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BueroOnboardingClient from './BueroOnboardingClient'

export default async function BueroOnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Profil-Daten laden
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  // Falls schon eine Buero-Org existiert: Status laden um direkt zum richtigen Schritt zu springen
  const { data: existingOrg } = await supabase
    .from('organisationen')
    .select('id, name, onboarding_status')
    .eq('hauptansprechpartner_user_id', user.id)
    .eq('typ', 'buero')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <BueroOnboardingClient
      userId={user.id}
      email={user.email ?? ''}
      profile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      existingOrg={existingOrg ?? null}
    />
  )
}
