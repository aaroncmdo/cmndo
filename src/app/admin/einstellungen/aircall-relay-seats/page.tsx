import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RelaySeatClient from './RelaySeatClient'

export default async function RelaySeatPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const { data: seats } = await supabase.from('aircall_relay_seats')
    .select('*')
    .order('created_at')

  return <RelaySeatClient seats={seats ?? []} />
}
