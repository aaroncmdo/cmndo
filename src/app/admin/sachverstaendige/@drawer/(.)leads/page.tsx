// Aaron 07.07.: SV-Leads als Drawer ueber der Sachverstaendige-Karte.
// Intercepting-Route (Soft-Nav zu /admin/sachverstaendige/leads oeffnet den
// Drawer, Karte bleibt darunter). Muster analog @drawer/(.)anlegen. Hard-Nav
// faellt auf die Full-Page ../../leads/page.tsx zurueck.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSvLeads } from '@/app/admin/sv-leads/actions'
import SvLeadsClient from '@/app/admin/sv-leads/SvLeadsClient'
import { DrawerShell } from '@/components/shared/detail'

export default async function InterceptedLeadsPage() {
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

  return (
    <DrawerShell title="SV-Leads" width={1040}>
      <div className="px-4">
        <SvLeadsClient svLeads={svLeads} hideHeader />
      </div>
    </DrawerShell>
  )
}
