import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import { redirect } from 'next/navigation'
import ReklamationenClient from './ReklamationenClient'

// F0: geteilter Reklamationen-Content (Auth-Guard + Data-Load + Client). `embedded`
// blendet den eigenen Header aus, wenn der Fälle-Hub-Header den Titel schon liefert.
export default async function ReklamationenContent({ embedded = false }: { embedded?: boolean }) {
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
    // CMM-49: faelle-frei via Bridge+claims (shared helper).
    for (const r of await claimNummernForFaelle(db, fallIds)) {
      fallNrMap[r.fall_id] = r.claim_nummer ?? r.fall_id.slice(0, 8)
    }
  }

  return <ReklamationenClient reklamationen={reklamationen ?? []} svNameMap={svNameMap} fallNrMap={fallNrMap} embedded={embedded} />
}
