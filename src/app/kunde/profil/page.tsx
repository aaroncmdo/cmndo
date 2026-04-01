import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KundeProfilClient from './KundeProfilClient'

export default async function KundeProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon, auth_provider')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const identities = user.identities ?? []
  const hasGoogle = identities.some(i => i.provider === 'google')
  const hasPhone = !!user.phone

  return (
    <KundeProfilClient
      profile={{
        vorname: profile.vorname ?? '',
        nachname: profile.nachname ?? '',
        email: profile.email ?? user.email ?? '',
        telefon: profile.telefon ?? user.phone ?? '',
        authProvider: profile.auth_provider ?? 'email',
        hasGoogle,
        hasPhone,
      }}
    />
  )
}
