import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ladeWerkstattDetail } from './detail-data'
import WerkstattDetailClient from './WerkstattDetailClient'

export default async function WerkstattDetailPage({
  params,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  /** "drawer" wenn eine Intercepting-Route die Page im DrawerShell rendert (Rezept-Muster). */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const detail = await ladeWerkstattDetail(id)
  if (!detail) notFound()

  return <WerkstattDetailClient detail={detail} currentUserId={user.id} variant={variant} />
}
