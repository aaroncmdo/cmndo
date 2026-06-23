import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSvLeads } from './actions'
import SvLeadsClient from './SvLeadsClient'

export default async function SvLeadsPage() {
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
