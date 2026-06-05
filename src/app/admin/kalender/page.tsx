import { createClient } from '@/lib/supabase/server'
import { claimNummernForFaelle } from '@/lib/claims/claim-nummer-map'
import KalenderClient from './KalenderClient'
import { getActiveGutachter } from '@/lib/actions/admin-kalender'

export default async function KalenderPage() {
  const supabase = await createClient()

  const [{ data: faelle }, { data: tasks }, { data: termine }] = await Promise.all([
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, claim_nummer, sv_termin, sv_id, status')
      .not('sv_termin', 'is', null),
    supabase
      .from('tasks')
      .select('id, fall_id, titel, faellig_am, status')
      .not('faellig_am', 'is', null),
    // BUG-08: Auch KB-Termine und manuelle Termine laden
    supabase
      .from('termine')
      .select('id, fall_id, typ, datum, dauer_minuten, betreff, status')
      .not('datum', 'is', null),
  ])

  // Fetch SV names
  const svIds = [...new Set((faelle ?? []).map(f => f.sv_id).filter(Boolean))]
  const { data: svs } = svIds.length > 0
    ? await supabase.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    : { data: [] }

  const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean)
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }

  const profileMap: Record<string, string> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
  }
  const svMap: Record<string, string> = {}
  for (const sv of svs ?? []) {
    svMap[sv.id] = profileMap[sv.profile_id] ?? '—'
  }

  // Fetch claim_nummer for tasks
  // CMM-49: faelle-frei via Bridge+claims (shared helper).
  const fallIds = [...new Set((tasks ?? []).map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap: Record<string, string> = {}
  for (const r of await claimNummernForFaelle(supabase, fallIds)) {
    fallMap[r.fall_id] = r.claim_nummer ?? r.fall_id.slice(0, 8)
  }

  // KFZ-138: Active Gutachter fuer Multiselect
  const gutachter = await getActiveGutachter()

  return (
    <KalenderClient
      faelle={faelle ?? []}
      tasks={tasks ?? []}
      termine={termine ?? []}
      svMap={svMap}
      fallMap={fallMap}
      gutachterList={gutachter}
    />
  )
}
