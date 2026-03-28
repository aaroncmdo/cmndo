import { createClient } from '@/lib/supabase/server'
import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, vorname, nachname, email, telefon, status, source_channel, source_domain, kontaktversuche, created_at')
    .order('created_at', { ascending: false })

  return <LeadsClient leads={leads ?? []} />
}
