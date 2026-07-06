import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listOpenProposals } from '@/lib/orchestrator/proposals'
import { AiVorschlaegeClient } from './AiVorschlaegeClient'

export const dynamic = 'force-dynamic'

export default async function AiVorschlaegePage() {
  // Admin-Guard (gleicher Aufbau wie admin/health/page.tsx)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (p?.rolle !== 'admin') redirect('/login')

  const vorschlaege = await listOpenProposals()
  return <AiVorschlaegeClient vorschlaege={vorschlaege} />
}
