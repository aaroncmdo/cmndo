import { createClient } from '@/lib/supabase/server'
import DispatchBoard from './DispatchBoard'

export default async function DispatchPage() {
  const supabase = await createClient()

  // Current user + Rolle für KB-Filter (BUG-104)
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  const { data: profile } = user
    ? await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    : { data: null }
  const isKb = profile?.rolle === 'kundenbetreuer'

  // Fetch leads and faelle in parallel
  let leadsQuery = supabase
    .from('leads')
    .select('id, vorname, nachname, email, telefon, status, source_channel, kontaktversuche, updated_at, created_at, qualifizierungs_phase, schadens_fall_typ, personenschaden_flag, mietwagen_flag, zugewiesen_an, rueckruf_datum, rueckruf_notiz, rueckruf_erledigt, anruf_versuche, letzter_anruf_am, letzter_anruf_status, flow_link_geoeffnet, flow_link_abgeschlossen, sa_unterschrieben, vollmacht_unterschrieben, finanzierung_leasing')
    .order('created_at', { ascending: false })
  let faelleQuery = supabase
    .from('faelle')
    .select('id, fall_nummer, status, schadens_ursache, sv_id, lead_id, kundenbetreuer_id, onboarding_complete, regulierung_am, anschlussschreiben_am, vs_eskalationsstufe, status_changed_at, updated_at, created_at, hat_vorschaeden')
    .order('created_at', { ascending: false })

  // BUG-104: KB sieht nur eigene Leads/Faelle
  if (isKb && user) {
    leadsQuery = leadsQuery.eq('zugewiesen_an', user.id)
    faelleQuery = faelleQuery.eq('kundenbetreuer_id', user.id)
  }

  const [leadsResult, faelleResult] = await Promise.all([leadsQuery, faelleQuery])

  const leads = leadsResult.data ?? []
  const faelle = faelleResult.data ?? []

  // Collect IDs for lookups
  const leadIds = [...new Set(faelle.map(f => f.lead_id).filter(Boolean))]
  const svIds = [...new Set(faelle.map(f => f.sv_id).filter(Boolean))]
  const betreuerIds = [...new Set(faelle.map(f => f.kundenbetreuer_id).filter(Boolean))]

  const [leadLookupResult, svResult, betreuerResult] = await Promise.all([
    leadIds.length > 0
      ? supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      : { data: [] },
    svIds.length > 0
      ? supabase.from('sachverstaendige').select('id, profile_id').in('id', svIds)
      : { data: [] },
    betreuerIds.length > 0
      ? supabase.from('profiles').select('id, vorname, nachname').in('id', betreuerIds)
      : { data: [] },
  ])

  // Get profile names for SVs
  const profileIds = (svResult.data ?? []).map(sv => sv.profile_id).filter(Boolean)
  const { data: svProfiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }

  // Build lookup maps
  const leadNameMap: Record<string, string> = {}
  for (const l of leadLookupResult.data ?? []) {
    leadNameMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }

  const svProfileMap: Record<string, string> = {}
  for (const p of svProfiles ?? []) {
    svProfileMap[p.id] = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—'
  }
  const svMap: Record<string, string> = {}
  for (const sv of svResult.data ?? []) {
    svMap[sv.id] = svProfileMap[sv.profile_id] ?? '—'
  }

  const betreuerMap: Record<string, string> = {}
  for (const b of betreuerResult.data ?? []) {
    betreuerMap[b.id] = `${b.vorname ?? ''} ${b.nachname ?? ''}`.trim() || '—'
  }

  return (
    <DispatchBoard
      leads={leads}
      faelle={faelle}
      leadNameMap={leadNameMap}
      svMap={svMap}
      betreuerMap={betreuerMap}
      currentUserId={user?.id ?? null}
    />
  )
}
