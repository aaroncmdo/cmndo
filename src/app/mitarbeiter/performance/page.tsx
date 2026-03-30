import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PerformanceClient from './PerformanceClient'
import UeberfaelligeTasks from '@/components/UeberfaelligeTasks'

export default async function MitarbeiterPerformancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, vorname, nachname, email, rolle, kategorie, kapazitaet_max')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const now = new Date()
  const monatStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const isDispatch = profile.kategorie === 'dispatch' || profile.rolle === 'leadbearbeiter'

  const [{ data: leadsRaw }, { data: faelleAktiv }, { data: faelleAbg }, { data: perf }, { data: incentives }, { data: leaderboardProfiles }] = await Promise.all([
    supabase.from('leads').select('id, status').eq('zugewiesen_an', user.id).gte('created_at', monatStr),
    supabase.from('faelle').select('id').eq('kundenbetreuer_id', user.id).not('status', 'in', '("abgeschlossen","storniert")'),
    supabase.from('faelle').select('id, created_at, abgeschlossen_am').eq('kundenbetreuer_id', user.id).eq('status', 'abgeschlossen').gte('abgeschlossen_am', monatStr),
    supabase.from('mitarbeiter_performance').select('*').eq('mitarbeiter_id', user.id).order('jahr', { ascending: false }).order('monat', { ascending: false }).limit(6),
    supabase.from('incentives').select('*').eq('aktiv', true).or(`kategorie.eq.alle,kategorie.eq.${isDispatch ? 'dispatch' : 'kundenbetreuer'}`),
    isDispatch
      ? supabase.from('profiles').select('id, vorname, nachname').or('kategorie.eq.dispatch,rolle.eq.leadbearbeiter').eq('aktiv', true)
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
    const { data: allFaelle } = await supabase.from('faelle').select('kundenbetreuer_id').eq('status', 'abgeschlossen').gte('abgeschlossen_am', monatStr)
    leaderboardData = (leaderboardProfiles ?? []).map(p => ({
      id: p.id,
      name: [p.vorname, p.nachname].filter(Boolean).join(' ') || '—',
      value: (allFaelle ?? []).filter(f => f.kundenbetreuer_id === p.id).length,
    })).sort((a, b) => b.value - a.value)
  }

  const monatLabel = now.toLocaleString('de-DE', { month: 'long' }) + ' ' + now.getFullYear()
  const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <>
      {/* @ts-expect-error Async Server Component */}
      <UeberfaelligeTasks mode="user" />
      <PerformanceClient
        profile={profile}
        stats={{ leadsTotal, leadsKonv, aktiveFaelle, abgeschlossen, isDispatch }}
        performanceHistory={perf ?? []}
        incentives={incentives ?? []}
        leaderboard={leaderboardData}
        monatLabel={monatLabel}
        userId={user.id}
      />
    </>
  )
}
