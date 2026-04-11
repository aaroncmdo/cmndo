import { createClient } from '@/lib/supabase/server'
import KalenderClient from './KalenderClient'
import { getActiveGutachter } from '@/lib/actions/admin-kalender'

export default async function KalenderPage() {
  const supabase = await createClient()

  const [{ data: faelle }, { data: tasks }, { data: termine }] = await Promise.all([
    supabase
      .from('faelle')
      .select('id, fall_nummer, sv_termin, sv_id, status')
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

  // Fetch fall_nummer for tasks
  const fallIds = [...new Set((tasks ?? []).map(t => t.fall_id).filter(Boolean))]
  const { data: taskFaelle } = fallIds.length > 0
    ? await supabase.from('faelle').select('id, fall_nummer').in('id', fallIds)
    : { data: [] }
  const fallMap: Record<string, string> = {}
  for (const f of taskFaelle ?? []) {
    fallMap[f.id] = f.fall_nummer ?? f.id.slice(0, 8)
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
