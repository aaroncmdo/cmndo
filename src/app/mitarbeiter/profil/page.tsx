// AAR-369: Mitarbeiter-Profilseite (KB, Leadbearbeiter, Admin)
// Avatar-Upload + Anzeigename + Profilbeschreibung.
// Dispatch/Admin nutzen dieselbe Seite, da sie im mitarbeiter-Layout liegen.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MitarbeiterProfilClient from './MitarbeiterProfilClient'

export default async function MitarbeiterProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, telefon, anzeigename, avatar_url, profilbeschreibung')
    .eq('id', user.id)
    .single()

  if (!profile || !['kundenbetreuer', 'leadbearbeiter', 'admin'].includes(profile.rolle)) {
    redirect('/login')
  }

  return (
    <MitarbeiterProfilClient
      email={user.email ?? ''}
      vorname={profile.vorname ?? ''}
      nachname={profile.nachname ?? ''}
      telefon={profile.telefon ?? null}
      rolle={profile.rolle}
      avatarUrl={profile.avatar_url ?? null}
      anzeigename={profile.anzeigename ?? ''}
      profilbeschreibung={profile.profilbeschreibung ?? ''}
    />
  )
}
