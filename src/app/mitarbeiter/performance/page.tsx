import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PerformanceClient from './PerformanceClient'
import UeberfaelligeTasks from '@/components/tasks/UeberfaelligeTasks'

export default async function MitarbeiterPerformancePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, email, rolle, kategorie, kapazitaet_max')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const now = new Date()
  const monatStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isDispatch = profile.kategorie === 'dispatch' || profile.rolle === 'dispatch'

  const [{ data: leadsRaw }, { data: faelleAktiv }, { data: faelleAbg }, { data: perf }, { data: incentives }, { data: leaderboardProfiles }] = await Promise.all([
    supabase.from('leads').select('id, status').eq('zugewiesen_an', user.id).gte('created_at', monatStr),
    // CMM-47 B.1: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
    // fall_id statt id, fall_status statt status, fall_created_at statt created_at.
    supabase.from('v_claim_full').select('fall_id').eq('kundenbetreuer_id', user.id).not('fall_status', 'in', '("abgeschlossen","storniert")'),
    supabase.from('v_claim_full').select('fall_id, fall_created_at, abgeschlossen_am').eq('kundenbetreuer_id', user.id).eq('fall_status', 'abgeschlossen').gte('abgeschlossen_am', monatStr),
    supabase.from('mitarbeiter_performance').select('*').eq('mitarbeiter_id', user.id).order('jahr', { ascending: false }).order('monat', { ascending: false }).limit(6),
    supabase.from('incentives').select('*').eq('aktiv', true).or(`kategorie.eq.alle,kategorie.eq.${isDispatch ? 'dispatch' : 'kundenbetreuer'}`),
    isDispatch
      ? supabase.from('profiles').select('id, vorname, nachname').or('kategorie.eq.dispatch,rolle.eq.dispatch').eq('aktiv', true)
      : supabase.from('profiles').select('id, vorname, nachname').or('kategorie.eq.kundenbetreuer,rolle.eq.kundenbetreuer').eq('aktiv', true),
  ])

  // Eigene Stats
  const leadsTotal = leadsRaw?.length ?? 0
  const leadsKonv = leadsRaw?.filter(l => l.status === 'umgewandelt' || l.status === 'umgewandelt-sv').length ?? 0
  const aktiveFaelle = faelleAktiv?.length ?? 0
  const abgeschlossen = faelleAbg?.length ?? 0

  // Leaderboard der eigenen Kategorie
  let leaderboardData: { id: string; name: string; value: number }[] = []
  if (isDispatch) {
    const { data: allLeads } = await supabase.from('leads').select('zugewiesen_an').gte('created_at', monatStr)
    leaderboardData = (leaderboardProfiles ?? []).map(p => ({
      id: p.id,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || '—',
      value: (allLeads ?? []).filter(l => l.zugewiesen_an === p.id).length,
    })).sort((a, b) => b.value - a.value)
  } else {
    // CMM-47 B.1: faelle → v_claim_full (fall_status statt status).
    const { data: allFaelle } = await supabase.from('v_claim_full').select('kundenbetreuer_id').eq('fall_status', 'abgeschlossen').gte('abgeschlossen_am', monatStr)
    leaderboardData = (leaderboardProfiles ?? []).map(p => ({
      id: p.id,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || '—',
      value: (allFaelle ?? []).filter(f => f.kundenbetreuer_id === p.id).length,
    })).sort((a, b) => b.value - a.value)
  }

  const monatLabel = now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', month: 'long' }) + ' ' + now.getFullYear()

  // Heute-Timeline: Termine + Tasks fuer heute
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [{ data: heuteTermine }, { data: heuteTasks }, { data: heuteGutachterTermine }] = await Promise.all([
    supabase.from('termine')
      .select('id, fall_id, typ, datum, dauer_minuten, betreff, meet_link, status, faelle(fall_nummer, leads!faelle_lead_id_fkey(vorname, nachname))')
      .eq('betreuer_user_id', user.id)
      .gte('datum', todayStart)
      .lt('datum', todayEnd)
      .in('status', ['geplant', 'bestaetigt'])
      .order('datum', { ascending: true }),
    supabase.from('tasks')
      .select('id, titel, status, prioritaet, faellig_am, fall_id, faelle(fall_nummer)')
      .or(`zugewiesen_an.eq.${user.id}`)
      .in('status', ['offen', 'in-bearbeitung'])
      .lte('faellig_am', todayEnd)
      .order('faellig_am', { ascending: true })
      .limit(20),
    supabase.from('gutachter_termine')
      .select('id, fall_id, start_zeit, end_zeit, status, faelle(fall_nummer, sv_id, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname)))')
      .gte('start_zeit', todayStart)
      .lt('start_zeit', todayEnd)
      .in('status', ['bestaetigt'])
      .order('start_zeit', { ascending: true }),
  ])

  // Build timeline items
  const timelineItems: { zeit: string; typ: string; label: string; detail: string; color: string; link?: string; meetLink?: string }[] = []

  for (const t of heuteTermine ?? []) {
    const fallRaw = t.faelle as unknown as Record<string, unknown> | null
    const leadRaw = fallRaw?.leads as { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] | null
    const lead = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw
    const kundeName = lead ? [lead?.vorname, lead?.nachname].filter(Boolean).join(' ') : 'Kunde'
    timelineItems.push({
      zeit: t.datum,
      typ: t.typ === 'video-call' ? 'video' : 'telefon',
      label: t.betreff ?? (t.typ === 'video-call' ? 'Video-Call' : 'Telefonat'),
      detail: `${kundeName} · ${t.dauer_minuten} Min`,
      color: t.typ === 'video-call' ? 'purple' : 'blue',
      link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
      meetLink: t.meet_link ?? undefined,
    })
  }

  for (const t of heuteTasks ?? []) {
    const fallRaw = t.faelle as unknown as Record<string, unknown> | null
    timelineItems.push({
      zeit: t.faellig_am ?? todayStart,
      typ: 'task',
      label: t.titel,
      detail: fallRaw?.fall_nummer ? `Fall ${fallRaw.fall_nummer}` : '',
      color: t.prioritaet === 'kritisch' || t.prioritaet === 'hoch' ? 'red' : 'amber',
      link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
    })
  }

  for (const t of heuteGutachterTermine ?? []) {
    timelineItems.push({
      zeit: t.start_zeit,
      typ: 'gutachter',
      label: 'Gutachtertermin',
      detail: `Fall ${(t.faelle as unknown as Record<string, unknown>)?.fall_nummer ?? ''}`,
      color: 'orange',
      link: t.fall_id ? `/faelle/${t.fall_id}` : undefined,
    })
  }

  timelineItems.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime())

  const ueberfaelligeTasks = (heuteTasks ?? []).filter(t => t.faellig_am && new Date(t.faellig_am) < now).length
  const terminCount = (heuteTermine ?? []).length + (heuteGutachterTermine ?? []).length
  const offeneTaskCount = (heuteTasks ?? []).length

  return (
    <>
      <UeberfaelligeTasks mode="user" />
      <PerformanceClient
        profile={profile}
        stats={{ leadsTotal, leadsKonv, aktiveFaelle, abgeschlossen, isDispatch }}
        performanceHistory={perf ?? []}
        incentives={incentives ?? []}
        leaderboard={leaderboardData}
        monatLabel={monatLabel}
        userId={user.id}
        timeline={timelineItems}
        tagesSummary={{ termine: terminCount, offeneTasks: offeneTaskCount, ueberfaellig: ueberfaelligeTasks }}
      />
    </>
  )
}
