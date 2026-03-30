import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ fallId: string }>
}) {
  const { fallId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch the case - verify ownership
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, onboarding_complete, kunde_id, sv_termin')
    .eq('id', fallId)
    .single()

  if (!fall) notFound()
  if (fall.kunde_id !== user.id) notFound()

  // Already completed onboarding → go to dashboard
  if (fall.onboarding_complete) {
    redirect('/kunde')
  }

  // Fetch pflichtdokumente for this case
  const { data: pflichtdokumente } = await supabase
    .from('pflichtdokumente')
    .select('id, titel, beschreibung, pflicht, status, datei_url, datei_name')
    .eq('fall_id', fallId)
    .order('created_at')

  // Also get already-uploaded flow documents (e.g. photos from FlowLink)
  const { data: existingDocs } = await supabase
    .from('dokumente')
    .select('id, typ, datei_url, datei_name')
    .eq('fall_id', fallId)

  return (
    <OnboardingClient
      fallId={fallId}
      fallNummer={fall.fall_nummer}
      svTermin={fall.sv_termin}
      pflichtdokumente={pflichtdokumente ?? []}
      existingDocs={existingDocs ?? []}
    />
  )
}
