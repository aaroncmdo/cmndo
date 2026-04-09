import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnlegenFallClient from './AnlegenFallClient'

// KFZ-154 Cleanup-Follow-up: Manuelle Fall-Anlage fuer Admin/Mitarbeiter
// (telefonischer Direkt-Eingang ohne vorherigen Lead-Edit-Loop).

export const dynamic = 'force-dynamic'

export default async function AnlegenFallPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin' && profile?.rolle !== 'mitarbeiter') {
    redirect('/login?error=Nur+Admins+und+Mitarbeiter')
  }

  return <AnlegenFallClient />
}
