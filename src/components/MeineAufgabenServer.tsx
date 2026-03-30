import { createClient } from '@/lib/supabase/server'
import MeineAufgaben from './MeineAufgaben'

export default async function MeineAufgabenServer({
  mode = 'user',
  rolle,
  title = 'Meine offenen Aufgaben',
  fallLinkPrefix = '/admin/faelle/',
  limit = 20,
}: {
  mode?: 'admin' | 'user'
  rolle?: string
  title?: string
  fallLinkPrefix?: string
  limit?: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  let query = supabase
    .from('tasks')
    .select('id, fall_id, titel, beschreibung, status, prioritaet, faellig_am, created_at, empfaenger_rolle')
    .not('status', 'eq', 'erledigt')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (mode === 'user') {
    query = query.eq('zugewiesen_an', user.id)
  }

  if (rolle) {
    query = query.eq('empfaenger_rolle', rolle)
  }

  const { data: rawTasks } = await query
  if (!rawTasks || rawTasks.length === 0) return null

  // Resolve fall_nummern and kunde names
  const fallIds = [...new Set(rawTasks.map(t => t.fall_id).filter(Boolean))]
  const { data: faelle } = fallIds.length > 0
    ? await supabase.from('faelle').select('id, fall_nummer, lead_id').in('id', fallIds)
    : { data: [] }

  const fallMap: Record<string, { fall_nummer: string; lead_id: string | null }> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id] = { fall_nummer: f.fall_nummer ?? f.id.slice(0, 8), lead_id: f.lead_id }
  }

  const leadIds = [...new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean))] as string[]
  const { data: leads } = leadIds.length > 0
    ? await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] }

  const leadNameMap: Record<string, string> = {}
  for (const l of leads ?? []) {
    leadNameMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '\u2014'
  }

  const tasks = rawTasks.map(t => ({
    id: t.id,
    fall_id: t.fall_id,
    titel: t.titel,
    beschreibung: t.beschreibung,
    status: t.status,
    prioritaet: t.prioritaet,
    faellig_am: t.faellig_am,
    created_at: t.created_at,
    fall_nummer: fallMap[t.fall_id]?.fall_nummer ?? null,
    kunde_name: fallMap[t.fall_id]?.lead_id ? leadNameMap[fallMap[t.fall_id].lead_id!] ?? null : null,
  }))

  return (
    <MeineAufgaben
      tasks={tasks}
      title={title}
      fallLinkPrefix={fallLinkPrefix}
    />
  )
}
