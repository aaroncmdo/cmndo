import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SVKalenderClient from './SVKalenderClient'

export default async function SVKalenderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the SV's sachverstaendige ID
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, gcal_connected, standort_lat, standort_lng')
    .eq('profile_id', user.id)
    .single()

  if (!sv) redirect('/login')

  // Fetch all cases assigned to this SV with appointment dates
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, sv_termin, status, schadens_ort, schadens_adresse, lead_id')
    .eq('sv_id', sv.id)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .order('sv_termin', { ascending: true })

  // Fetch lead names
  const leadIds = [...new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean))]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadMap: Record<string, string> = {}
  for (const l of leads ?? []) {
    leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  return (
    <SVKalenderClient
      faelle={faelle ?? []}
      leadMap={leadMap}
      svId={sv.id}
      gcalConnected={!!sv.gcal_connected}
      standortLat={sv.standort_lat ? Number(sv.standort_lat) : null}
      standortLng={sv.standort_lng ? Number(sv.standort_lng) : null}
    />
  )
}
