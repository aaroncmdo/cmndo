import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listCommunities } from '@/app/admin/sachverstaendige/anlegen/actions'
import CommunitiesListClient from './CommunitiesListClient'

// KFZ-152 Phase 3: Admin-Listing fuer Communities (eigener Bereich, nicht im
// Sachverstaendige-Anlege-Tab — Community hat eine besondere virtuelle
// Klammer-Struktur und gehoert in einen eigenen Bereich).

export const dynamic = 'force-dynamic'

export default async function CommunitiesPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const communities = await listCommunities()

  return <CommunitiesListClient communities={communities} />
}
