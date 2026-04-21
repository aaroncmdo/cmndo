// AAR-93: SV-Portal Reklamationen Liste + Dialog
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReklamationenClient from './ReklamationenClient'

export const dynamic = 'force-dynamic'

export default async function GutachterReklamationen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!sv) {
    return <div className="p-6 text-sm text-gray-500">Kein SV-Account gefunden.</div>
  }

  const { data: reklamationen } = await supabase
    .from('reklamationen')
    .select('id, fall_id, grund, begruendung, status, eingereicht_am, bearbeitet_am, admin_begruendung, faelle(fall_nummer, kennzeichen)')
    .eq('sv_id', sv.id)
    .order('eingereicht_am', { ascending: false })

  // Eigene Faelle (offen) fuer Auswahl
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen')
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <ReklamationenClient
      reklamationen={(reklamationen ?? []) as Parameters<typeof ReklamationenClient>[0]['reklamationen']}
      faelle={(faelle ?? []) as Parameters<typeof ReklamationenClient>[0]['faelle']}
    />
  )
}
