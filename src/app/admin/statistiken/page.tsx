import { createClient } from '@/lib/supabase/server'
import StatistikenClient from './StatistikenClient'

export default async function StatistikenPage() {
  const supabase = await createClient()

  const [
    { data: faelle },
    { data: leads },
    { data: svList },
  ] = await Promise.all([
    supabase
      .from('faelle')
      .select('id, status, schadens_ursache, sv_id, regulierung_betrag, regulierung_am, gutachten_betrag, gutachten_eingegangen_am, sv_zugewiesen_am, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('id, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('sachverstaendige')
      .select('id, profiles(vorname, nachname)')
      .eq('ist_aktiv', true),
  ])

  // Build SV name map
  const svNameMap: Record<string, string> = {}
  for (const sv of svList ?? []) {
    const p = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as {
      vorname: string | null
      nachname: string | null
    } | null
    svNameMap[sv.id] = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—' : '—'
  }

  return (
    <StatistikenClient
      faelle={faelle ?? []}
      leads={leads ?? []}
      svNameMap={svNameMap}
    />
  )
}
