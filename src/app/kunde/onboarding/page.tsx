// AAR-100: Kunden-Portal Onboarding Page
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingWizard from './OnboardingWizard'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, onboarding_completed_at')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed_at) redirect('/kunde')

  // Aktiver Fall des Kunden
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, sv_termin')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Reservierter SV-Termin mit Name
  let svName: string | null = null
  let terminDatum: string | null = null
  if (fall?.id) {
    const { data: termin } = await supabase
      .from('gutachter_termine')
      .select('start_zeit, sachverstaendige(profile_id, profiles(vorname))')
      .eq('fall_id', fall.id)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (termin) {
      terminDatum = (termin.start_zeit as string | null) ?? null
      const svJoin = termin.sachverstaendige as unknown
      const svRow = Array.isArray(svJoin) ? svJoin[0] : svJoin
      const p = (svRow as { profiles?: { vorname?: string | null } | { vorname?: string | null }[] } | null)?.profiles
      const pRow = Array.isArray(p) ? p[0] : p
      svName = pRow?.vorname ?? null
    }
  }

  // Pflichtdokumente des Falls
  const { data: pflichtDocs } = fall?.id
    ? await supabase
        .from('pflichtdokumente')
        .select('id, dokument_typ, status, pflicht, dokument_url, hochgeladen_am')
        .eq('fall_id', fall.id)
        .order('pflicht', { ascending: false })
    : { data: [] }

  return (
    <OnboardingWizard
      vorname={profile?.vorname ?? ''}
      fall={fall ? { id: fall.id, fall_nummer: fall.fall_nummer, kennzeichen: fall.kennzeichen, fahrzeug: [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') } : null}
      termin={terminDatum ? { datum: terminDatum, svName } : null}
      pflichtDocs={(pflichtDocs ?? []) as Parameters<typeof OnboardingWizard>[0]['pflichtDocs']}
    />
  )
}
