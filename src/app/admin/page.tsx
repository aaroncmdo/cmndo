import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()

  return <DashboardClient userId={user.id} userRolle={profile?.rolle ?? 'admin'} />
}
