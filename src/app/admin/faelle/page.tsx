import { createClient } from '@/lib/supabase/server'
import FaelleKanban from './FaelleKanban'

export default async function AdminFaellePage() {
  const supabase = await createClient()

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_id, kundenbetreuer_id, mandatsnummer, schadenfall_typ, kennzeichen, created_at, kunde_id, lead_id, ist_aktiv, deaktiviert_grund')
    .not('status', 'eq', 'storniert')
    .order('created_at', { ascending: false })

  // Resolve names
  const enriched = await Promise.all((faelle ?? []).map(async (f) => {
    let kunde_name: string | null = null
    let betreuer_name: string | null = null
    let sv_name: string | null = null

    // Kunde name from lead
    if (f.lead_id) {
      const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', f.lead_id).single()
      if (lead) kunde_name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
    }

    // Betreuer name
    if (f.kundenbetreuer_id) {
      const { data: p } = await supabase.from('profiles').select('vorname, nachname').eq('id', f.kundenbetreuer_id).single()
      if (p) betreuer_name = [p.vorname, p.nachname].filter(Boolean).join(' ') || null
    }

    // SV name
    if (f.sv_id) {
      const { data: sv } = await supabase.from('sachverstaendige').select('profiles(vorname, nachname)').eq('id', f.sv_id).single()
      if (sv) {
        const pr = (Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles) as { vorname: string | null; nachname: string | null } | null
        if (pr) sv_name = [pr.vorname, pr.nachname].filter(Boolean).join(' ') || null
      }
    }

    // KFZ-128: Ungelesene Nachrichten zaehlen
    const { count: ungelesene } = await supabase
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', f.id)
      .eq('gelesen', false)
      .eq('sender_rolle', 'kunde')

    // KFZ-182: Ungelesene Updates (Tasks + Timeline + Dokumente)
    const { data: readState } = await supabase
      .from('fall_read_state')
      .select('last_read_update_at')
      .eq('fall_id', f.id)
      .maybeSingle()
    const since = readState?.last_read_update_at ?? '1970-01-01T00:00:00Z'
    const { data: updateCount } = await supabase.rpc('count_unread_updates', { p_fall_id: f.id, p_since: since })

    return {
      id: f.id as string,
      fall_nummer: f.fall_nummer as string | null,
      status: f.status as string,
      schadens_ursache: f.schadens_ursache as string | null,
      schadens_ort: f.schadens_ort as string | null,
      sv_id: f.sv_id as string | null,
      kundenbetreuer_id: f.kundenbetreuer_id as string | null,
      mandatsnummer: (f as Record<string, unknown>).mandatsnummer as string | null,
      schadenfall_typ: (f as Record<string, unknown>).schadenfall_typ as string | null,
      kennzeichen: (f as Record<string, unknown>).kennzeichen as string | null,
      created_at: f.created_at as string,
      ist_aktiv: (f as Record<string, unknown>).ist_aktiv as boolean | null,
      deaktiviert_grund: (f as Record<string, unknown>).deaktiviert_grund as string | null,
      kunde_name,
      betreuer_name,
      sv_name,
      ungelesene_nachrichten: ungelesene ?? 0,
      ungelesene_updates: typeof updateCount === 'number' ? updateCount : 0,
    }
  }))

  return <FaelleKanban faelle={enriched} />
}
