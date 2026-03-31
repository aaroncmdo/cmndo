import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import OnboardingClient from './OnboardingClient'

export default async function GutachterOnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if SV already exists and is fully onboarded
  const sv = await getGutachterForUser(supabase, user.id, 'id, ist_aktiv')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  return (
    <OnboardingClient
      userId={user.id}
      email={user.email ?? ''}
      existingProfile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      existingSvId={sv?.id ?? null}
    />
  )
}
