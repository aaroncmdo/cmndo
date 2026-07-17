import { createClient } from '@/lib/supabase/server'
import TeamClient from './TeamClient'
import LeaderboardClient from './leaderboard/LeaderboardClient'
import IncentivesClient from './incentives/IncentivesClient'

export default async function TeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const tab = (await searchParams)?.tab

  // W1.4 (Routen-Cleanup): Leaderboard + Incentives sind Tabs DIESES Hubs (?tab=),
  // keine eigenen Routen mehr. Pro Tab nur dessen Daten laden (Rezept-Regel 5).
  if (tab === 'leaderboard') return renderLeaderboard(supabase)
  if (tab === 'incentives') return renderIncentives(supabase)

  const now = new Date()
  const monat = now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', month: 'long' })
  const jahr = now.getFullYear()
  const monatStr = `${jahr}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: mitarbeiterRaw },
    { data: vergList },
    { data: leadsRaw },
    { data: faelleAktivRaw },
    { data: faelleAbgRaw },
    { count: fallbackCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, vorname, nachname, rolle, telefon, force_password_change, created_at, kategorie, kapazitaet_max, aktiv')
      .in('rolle', ['admin', 'kundenbetreuer', 'dispatch', 'kanzlei'])
      .order('created_at', { ascending: false }),
    // W2.3/AAR-951: HR-Felder aus admin-only mitarbeiter_verguetung (RLS is_admin -> nur Admin sieht Werte).
    supabase.from('mitarbeiter_verguetung').select('profile_id, position, gehaltsstufe, eingestellt_am'),
    supabase.from('leads').select('zugewiesen_an, status').gte('created_at', monatStr),
    // CMM-47: faelle → v_claim_full. CMM-49 T1.2-d: KPI liest abgeleitete Phase
    // (main_phase/sub_phase) statt fall_status; abgeschlossen == sub_phase='erfolgreich_reguliert'.
    supabase.from('v_claim_full').select('kundenbetreuer_id').neq('main_phase', 'abschluss'),
    supabase.from('v_claim_full').select('kundenbetreuer_id').eq('sub_phase', 'erfolgreich_reguliert').gte('abgeschlossen_am', monatStr),
    // AAR-427: KPI — aktive Fälle die aktuell im Admin-Fallback laufen
    supabase
      .from('v_claim_full')
      .select('id', { count: 'exact', head: true })
      .eq('kundenbetreuer_fallback_flag', true)
      .neq('main_phase', 'abschluss'),
  ])

  // W2.3/AAR-951: HR flach in die Mitarbeiterliste mergen (TeamClient bleibt unveraendert).
  type VergListRow = { profile_id: string; position: string | null; gehaltsstufe: string | null; eingestellt_am: string | null }
  const vergMap = new Map(((vergList ?? []) as VergListRow[]).map((v) => [v.profile_id, v]))
  const mitarbeiter = (mitarbeiterRaw ?? []).map(m => {
    const v = vergMap.get(m.id)
    return { ...m, position: v?.position ?? null, gehaltsstufe: v?.gehaltsstufe ?? null, eingestellt_am: v?.eingestellt_am ?? null }
  })

  const leadsByUser: Record<string, { total: number; konvertiert: number }> = {}
  for (const l of leadsRaw ?? []) {
    if (!l.zugewiesen_an) continue
    if (!leadsByUser[l.zugewiesen_an]) leadsByUser[l.zugewiesen_an] = { total: 0, konvertiert: 0 }
    leadsByUser[l.zugewiesen_an].total++
    if (l.status === 'umgewandelt' || l.status === 'umgewandelt-sv') leadsByUser[l.zugewiesen_an].konvertiert++
  }
  const aktiveFaelleByUser: Record<string, number> = {}
  for (const f of faelleAktivRaw ?? []) {
    if (f.kundenbetreuer_id) aktiveFaelleByUser[f.kundenbetreuer_id] = (aktiveFaelleByUser[f.kundenbetreuer_id] ?? 0) + 1
  }
  const abgeschlossenByUser: Record<string, number> = {}
  for (const f of faelleAbgRaw ?? []) {
    if (f.kundenbetreuer_id) abgeschlossenByUser[f.kundenbetreuer_id] = (abgeschlossenByUser[f.kundenbetreuer_id] ?? 0) + 1
  }

  return (
    <TeamClient
      mitarbeiter={mitarbeiter ?? []}
      leadsByUser={leadsByUser}
      aktiveFaelleByUser={aktiveFaelleByUser}
      abgeschlossenByUser={abgeschlossenByUser}
      monatLabel={`${monat} ${jahr}`}
      kbFallbackAktiv={fallbackCount ?? 0}
    />
  )
}

// --- Tab: Leaderboard (vorher /admin/team/leaderboard) ---
async function renderLeaderboard(supabase: Awaited<ReturnType<typeof createClient>>) {
  const now = new Date()
  const monatStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const vormonatDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const vormonatStr = `${vormonatDate.getFullYear()}-${String(vormonatDate.getMonth() + 1).padStart(2, '0')}-01`
  const vormonatEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: dispatchProfiles },
    { data: kundenProfiles },
    { data: leadsAktuell },
    { data: leadsVormonat },
    { data: faelleAktuell },
    { data: faelleVormonat },
    { data: faelleAktiv },
  ] = await Promise.all([
    supabase.from('profiles').select('id, vorname, nachname, email').or('kategorie.eq.dispatch,rolle.eq.dispatch').eq('aktiv', true),
    supabase.from('profiles').select('id, vorname, nachname, email, kapazitaet_max').or('kategorie.eq.kundenbetreuer,rolle.eq.kundenbetreuer').eq('aktiv', true),
    supabase.from('leads').select('zugewiesen_an, status').gte('created_at', monatStr),
    supabase.from('leads').select('zugewiesen_an, status').gte('created_at', vormonatStr).lt('created_at', vormonatEnd),
    supabase.from('v_claim_full').select('kundenbetreuer_id, fall_created_at, abgeschlossen_am').eq('sub_phase', 'erfolgreich_reguliert').gte('abgeschlossen_am', monatStr),
    supabase.from('v_claim_full').select('kundenbetreuer_id').eq('sub_phase', 'erfolgreich_reguliert').gte('abgeschlossen_am', vormonatStr).lt('abgeschlossen_am', vormonatEnd),
    supabase.from('v_claim_full').select('kundenbetreuer_id').neq('main_phase', 'abschluss'),
  ])

  const dispatchStats = (dispatchProfiles ?? []).map(p => {
    const mLeads = (leadsAktuell ?? []).filter(l => l.zugewiesen_an === p.id)
    const quali = mLeads.length
    const konv = mLeads.filter(l => l.status === 'umgewandelt' || l.status === 'umgewandelt-sv').length
    const vLeads = (leadsVormonat ?? []).filter(l => l.zugewiesen_an === p.id)
    const vQuali = vLeads.length
    return {
      id: p.id,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || p.email || '—',
      leads_qualifiziert: quali,
      leads_konvertiert: konv,
      conversion_rate: quali > 0 ? Math.round((konv / quali) * 100) : 0,
      trend: quali - vQuali,
    }
  }).sort((a, b) => b.leads_qualifiziert - a.leads_qualifiziert)

  const kundenStats = (kundenProfiles ?? []).map(p => {
    const abg = (faelleAktuell ?? []).filter(f => f.kundenbetreuer_id === p.id)
    const aktiv = (faelleAktiv ?? []).filter(f => f.kundenbetreuer_id === p.id).length
    const vAbg = (faelleVormonat ?? []).filter(f => f.kundenbetreuer_id === p.id).length
    let avgDays = 0
    const completed = abg.filter(f => f.abgeschlossen_am && f.fall_created_at)
    if (completed.length > 0) {
      const total = completed.reduce((s, f) => s + (new Date(f.abgeschlossen_am!).getTime() - new Date(f.fall_created_at!).getTime()) / 86400000, 0)
      avgDays = Math.round(total / completed.length)
    }
    return {
      id: p.id,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || p.email || '—',
      aktive_faelle: aktiv,
      faelle_abgeschlossen: abg.length,
      avg_bearbeitungszeit: avgDays,
      trend: abg.length - vAbg,
    }
  }).sort((a, b) => b.faelle_abgeschlossen - a.faelle_abgeschlossen)

  const monatLabel = now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', month: 'long' }) + ' ' + now.getFullYear()

  return <LeaderboardClient dispatch={dispatchStats} kundenbetreuer={kundenStats} monatLabel={monatLabel} />
}

// --- Tab: Incentives (vorher /admin/team/incentives) ---
async function renderIncentives(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: incentives }, { data: auszahlungen }, { data: profiles }] = await Promise.all([
    supabase.from('incentives').select('*').order('created_at', { ascending: false }),
    supabase.from('incentive_auszahlungen').select('*, profiles:mitarbeiter_id(vorname, nachname, email)').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, vorname, nachname, email, rolle, kategorie').in('rolle', ['admin', 'kundenbetreuer', 'dispatch']).eq('aktiv', true),
  ])
  return <IncentivesClient incentives={incentives ?? []} auszahlungen={auszahlungen ?? []} profiles={profiles ?? []} />
}
