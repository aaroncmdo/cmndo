import { createClient } from '@/lib/supabase/server'
import LeaderboardClient from './LeaderboardClient'

export default async function LeaderboardPage() {
  const supabase = await createClient()
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
    supabase.from('faelle').select('kundenbetreuer_id, created_at, abgeschlossen_am').eq('status', 'abgeschlossen').gte('abgeschlossen_am', monatStr),
    supabase.from('faelle').select('kundenbetreuer_id').eq('status', 'abgeschlossen').gte('abgeschlossen_am', vormonatStr).lt('abgeschlossen_am', vormonatEnd),
    supabase.from('faelle').select('kundenbetreuer_id').not('status', 'in', '("abgeschlossen","storniert")'),
  ])

  // Dispatch Leaderboard
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

  // Kundenbetreuer Leaderboard
  const kundenStats = (kundenProfiles ?? []).map(p => {
    const abg = (faelleAktuell ?? []).filter(f => f.kundenbetreuer_id === p.id)
    const aktiv = (faelleAktiv ?? []).filter(f => f.kundenbetreuer_id === p.id).length
    const vAbg = (faelleVormonat ?? []).filter(f => f.kundenbetreuer_id === p.id).length
    let avgDays = 0
    const completed = abg.filter(f => f.abgeschlossen_am && f.created_at)
    if (completed.length > 0) {
      const total = completed.reduce((s, f) => s + (new Date(f.abgeschlossen_am!).getTime() - new Date(f.created_at).getTime()) / 86400000, 0)
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

  const monatLabel = now.toLocaleString('de-DE', { month: 'long' }) + ' ' + now.getFullYear()

  return <LeaderboardClient dispatch={dispatchStats} kundenbetreuer={kundenStats} monatLabel={monatLabel} />
}
