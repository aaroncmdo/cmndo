import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import TermineClient from './TermineClient'

// KFZ-134: Gutachter Termine-Übersicht mit Akzeptieren/Gegenvorschlag-Buttons.

export const dynamic = 'force-dynamic'

export default async function GutachterTerminePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  // AAR-133: lead_id mitlesen — Pre-FlowLink-Termine haben fall_id=null
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, start_zeit, end_zeit, status, vorgeschlagenes_datum, gegenvorschlag_von, gegenvorschlag_grund, ankunft_zeit, abgelehnt_am, abgelehnt_grund, created_at')
    .eq('sv_id', sv.id)
    .order('start_zeit', { ascending: true })

  // Fall-Nummern + Kunden-Namen nachladen
  const fallIds = [...new Set((termine ?? []).map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap = new Map<string, { fall_nummer: string; kunde_name: string }>()
  if (fallIds.length) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id')
      .in('id', fallIds)
    const leadIds = (faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]
    const leadMap = new Map<string, { vorname: string | null; nachname: string | null }>()
    if (leadIds.length) {
      const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      for (const l of leads ?? []) leadMap.set(l.id, l)
    }
    for (const f of faelle ?? []) {
      const lead = f.lead_id ? leadMap.get(f.lead_id) : null
      fallMap.set(f.id as string, {
        fall_nummer: (f.fall_nummer as string) ?? (f.id as string).slice(0, 8),
        kunde_name: lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—' : '—',
      })
    }
  }

  // AAR-133: Pre-FlowLink — lead-Daten direkt laden für Termine ohne fall_id
  const directLeadIds = [...new Set((termine ?? [])
    .filter(t => !t.fall_id && t.lead_id)
    .map(t => t.lead_id as string))]
  const directLeadMap = new Map<string, { vorname: string | null; nachname: string | null }>()
  if (directLeadIds.length) {
    const { data: directLeads } = await supabase
      .from('leads')
      .select('id, vorname, nachname')
      .in('id', directLeadIds)
    for (const l of directLeads ?? []) directLeadMap.set(l.id, l)
  }

  const rows = (termine ?? []).map(t => {
    const fId = t.fall_id as string | null
    const lId = t.lead_id as string | null
    const fallEntry = fId ? fallMap.get(fId) : undefined
    const directLead = !fId && lId ? directLeadMap.get(lId) : undefined
    const istVorreservierung = !fId && !!lId
    return {
      ...t,
      id: t.id as string,
      fall_id: fId,
      lead_id: lId,
      // AAR-133: Referenz-Label und Kunde fallen graceful auf Lead-Daten zurück
      fall_nummer: fallEntry?.fall_nummer ?? (lId ? `Lead ${lId.slice(0, 8)}` : '—'),
      kunde_name: fallEntry?.kunde_name ?? (directLead ? [directLead.vorname, directLead.nachname].filter(Boolean).join(' ') || '—' : '—'),
      istVorreservierung,
      start_zeit: t.start_zeit as string,
      end_zeit: t.end_zeit as string,
      status: t.status as string,
      vorgeschlagenes_datum: t.vorgeschlagenes_datum as string | null,
      gegenvorschlag_von: t.gegenvorschlag_von as string | null,
      gegenvorschlag_grund: t.gegenvorschlag_grund as string | null,
    }
  })

  return <TermineClient termine={rows} />
}
