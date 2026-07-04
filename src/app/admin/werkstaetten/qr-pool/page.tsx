import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { QrPoolClient, type PoolCode } from './QrPoolClient'

export const dynamic = 'force-dynamic'

export default async function QrPoolPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const admin = createAdminClient()
  const [{ data: codes }, { data: werkstaetten }] = await Promise.all([
    admin
      .from('werkstatt_qr_pool')
      .select('id, token, status, charge, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('werkstaetten')
      .select('id, name')
      .eq('status', 'aktiv')
      .order('name', { ascending: true }),
  ])

  return (
    <QrPoolClient
      codes={(codes ?? []) as PoolCode[]}
      werkstaetten={(werkstaetten ?? []) as { id: string; name: string }[]}
    />
  )
}
