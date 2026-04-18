import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ReklamationenClient from './ReklamationenClient'

export default async function AdminReklamationenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const db = createAdminClient()
  const { data: reklamationen } = await db.from('reklamationen')
    .select('id, fall_id, sv_id, grund, begruendung, eingereicht_am, status, frist_bis, admin_begruendung')
    .order('eingereicht_am', { ascending: false })

  // SV-Namen + Fall-Nummern laden
  const svIds = [...new Set((reklamationen ?? []).map(r => r.sv_id))]
  const fallIds = [...new Set((reklamationen ?? []).map(r => r.fall_id))]

  const svNameMap: Record<string, string> = {}
  if (svIds.length > 0) {
    const { data: svs } = await db.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    const pIds = (svs ?? []).map(s => s.profile_id).filter(Boolean)
    if (pIds.length > 0) {
      const { data: profiles } = await db.from('profiles').select('id, vorname, nachname').in('id', pIds)
      const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim()]))
      for (const sv of svs ?? []) svNameMap[sv.id] = pMap[sv.profile_id] ?? '—'
    }
  }

  const fallNrMap: Record<string, string> = {}
  if (fallIds.length > 0) {
    const { data: faelle } = await db.from('faelle').select('id, fall_nummer').in('id', fallIds)
    for (const f of faelle ?? []) fallNrMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
  }

  return <ReklamationenClient reklamationen={reklamationen ?? []} svNameMap={svNameMap} fallNrMap={fallNrMap} />
}
