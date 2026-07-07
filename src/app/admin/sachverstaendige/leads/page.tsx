// Aaron 07.07.: SV-Leads-Verwaltung in die Sachverstaendige-Sektion geholt.
// Full-Page-Fallback (Deep-Link / Hard-Nav); die Soft-Nav oeffnet den Drawer
// ueber der Karte via @drawer/(.)leads. Reused getSvLeads + SvLeadsClient
// (unveraendert; die Actions/Types bleiben unter /admin/sv-leads).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSvLeads } from '@/app/admin/sv-leads/actions'
import SvLeadsClient from '@/app/admin/sv-leads/SvLeadsClient'

export const dynamic = 'force-dynamic'

export default async function SachverstaendigeLeadsPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const svLeads = await getSvLeads()

  return <SvLeadsClient svLeads={svLeads} />
}
