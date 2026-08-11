import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WerkstaettenClient from './WerkstaettenClient'
import { AusstehendeFreigabenSection } from './AusstehendeFreigabenSection'
import { getAusstehendeFreigaben } from '@/lib/werkstatt/ausstehende-freigaben'

export default async function WerkstaettenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const [{ data: werkstaetten }, ausstehendeFreigaben] = await Promise.all([
    supabase
      .from('werkstaetten')
      .select('id, name, adresse_ort, adresse_plz, status, provision_betrag_netto, aktiviert_am, email, telefon, faehigkeiten, lat, lng')
      .order('aktiviert_am', { ascending: false }),
    getAusstehendeFreigaben(),
  ])

  return (
    <div className="space-y-6">
      <AusstehendeFreigabenSection rows={ausstehendeFreigaben} />
      <WerkstaettenClient werkstaetten={werkstaetten ?? []} />
    </div>
  )
}
