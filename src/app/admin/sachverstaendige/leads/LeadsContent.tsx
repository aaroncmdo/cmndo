// Aaron 07.07.: SV-Leads-Verwaltung in die Sachverstaendige-Sektion geholt.
// F2b: dieser Content ist jetzt kanonisch unter /admin/vertrieb/sachverstaendige/leads
// (Re-Export); /admin/sachverstaendige/leads ist ein 308-Redirect dorthin. Der fruehere
// Legacy-@drawer/(.)leads wurde entfernt (tot, da die Liste wegredirectet). Reused
// getSvLeads + SvLeadsClient (unveraendert; Actions/Types bleiben unter /admin/sv-leads).

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
