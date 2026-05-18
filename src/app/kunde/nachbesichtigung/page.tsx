import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NachbesichtigungClient from './NachbesichtigungClient'

export default async function NachbesichtigungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Fälle des Kunden mit offener Nachbesichtigung
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am')
    .eq('kunde_id', user.id)
    .eq('nachbesichtigung_status', 'angefordert')

  if (!faelle?.length) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border p-8 max-w-md text-center">
          <p className="text-claimondo-ondo">Aktuell keine offene Nachbesichtigung.</p>
        </div>
      </div>
    )
  }

  return <NachbesichtigungClient faelle={faelle} />
}
