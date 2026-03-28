import { createClient } from '@/lib/supabase/server'
import DispatchBoard from './DispatchBoard'

export default async function DispatchPage() {
  const supabase = await createClient()

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, sv_id, lead_id, updated_at, created_at')
    .order('created_at', { ascending: false })

  // Collect lead_ids and sv_ids for name lookups
  const leadIds = [...new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean))]
  const svIds = [...new Set((faelle ?? []).map(f => f.sv_id).filter(Boolean))]

  const [leadResult, svResult] = await Promise.all([
    leadIds.length > 0
      ? supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      : { data: [] },
    svIds.length > 0
      ? supabase.from('sachverstaendige').select('id, profile_id').in('id', svIds)
      : { data: [] },
  ])

  // Get profile names for SVs
  const profileIds = (svResult.data ?? []).map(sv => sv.profile_id).filter(Boolean)
  const { data: svProfiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }

  // Build lookup maps
  const leadMap: Record<string, string> = {}
  for (const l of leadResult.data ?? []) {
    leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  const svProfileMap: Record<string, string> = {}
  for (const p of svProfiles ?? []) {
    svProfileMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
  }
  const svMap: Record<string, string> = {}
  for (const sv of svResult.data ?? []) {
    svMap[sv.id] = svProfileMap[sv.profile_id] ?? '—'
  }

  return (
    <DispatchBoard
      faelle={faelle ?? []}
      leadMap={leadMap}
      svMap={svMap}
    />
  )
}
