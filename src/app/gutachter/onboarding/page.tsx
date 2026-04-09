import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import OnboardingClient from './OnboardingClient'

export default async function GutachterOnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Check if SV already exists and is fully onboarded
  const sv = await getGutachterForUser(supabase, user.id, 'id, paket, onboarding_status, onboarding_anzahlung_betrag, vertrag_unterschrieben, ist_aktiv')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  // KFZ-148 Lückenfix: Vertragsvorlagen serverseitig laden für den Vertrags-Step
  const { data: vorlagen } = await supabase
    .from('vertragsvorlagen')
    .select('id, typ, titel, version, inhalt_html, pflicht_unterschrift')
    .eq('aktiv', true)

  const nbVorlage = (vorlagen ?? []).find(v => v.typ === 'nutzungsbedingungen') ?? null
  const kvVorlage = (vorlagen ?? []).find(v => v.typ === 'kooperationsvertrag_muster') ?? null

  return (
    <OnboardingClient
      userId={user.id}
      email={user.email ?? ''}
      existingProfile={profile ?? { vorname: null, nachname: null, email: null, telefon: null }}
      existingSv={sv ?? null}
      nbVorlage={nbVorlage}
      kvVorlage={kvVorlage}
    />
  )
}
