// Firmen-Flotten-Akte (Vertrieb-Cockpit): Full-Page-RSC. Laedt getFirmenFlotteDetail (staff-
// gegatet) und rendert die Sektions-View. Direkter URL-Aufruf / Hard-Nav zeigt diese Seite;
// Soft-Nav aus dem Cockpit-Roster wird vom @drawer-Intercept als Drawer ueber dem Cockpit
// gerendert (Muster: sachverstaendige/werkstaetten-Detail).
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getFirmenFlotteDetail } from '../../_actions/firmen-flotte-detail-daten'
import FirmenFlotteDetailClient from './FirmenFlotteDetailClient'

export const dynamic = 'force-dynamic'

export default async function FirmenFlotteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin' && profile?.rolle !== 'dispatch') redirect('/admin')

  const res = await getFirmenFlotteDetail(id)
  if (!res.ok) {
    if (res.error === 'Firma nicht gefunden.') notFound()
    return <p className="p-6 text-body-sm text-danger">{res.error}</p>
  }

  return <FirmenFlotteDetailClient detail={res.data} />
}
