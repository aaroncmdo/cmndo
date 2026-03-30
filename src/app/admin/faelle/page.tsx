import { createClient } from '@/lib/supabase/server'
import FaelleKanban from './FaelleKanban'

export default async function AdminFaellePage() {
  const supabase = await createClient()

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, schadens_ort, sv_id, kundenbetreuer_id, mandatsnummer, schadenfall_typ, kennzeichen, created_at, kunde_id, lead_id')
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
      kunde_name,
      betreuer_name,
      sv_name,
    }
  }))

  return <FaelleKanban faelle={enriched} />
}
